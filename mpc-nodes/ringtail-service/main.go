package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	// Import the Ringtail implementation
	// Note: Update this import path based on your module setup
	// ringtail "lattice-threshold-signature/sign"
)

// RingtailService wraps the Ringtail signing protocol
type RingtailService struct {
	partyID   int
	threshold int
	parties   int
	// party     *ringtail.Party
	sessions  map[string]*SigningSession
	mu        sync.RWMutex
}

// SigningSession tracks the state of an ongoing signing session
type SigningSession struct {
	SessionID    string
	Message      []byte
	Round1Data   []byte
	Commitments  map[int][]byte
	StartTime    time.Time
	Round1Done   bool
	Finalized    bool
}

// SignRequest represents a signing request
type SignRequest struct {
	SessionID    string                 `json:"session_id"`
	Message      string                 `json:"message"` // Hex encoded
	Round        int                    `json:"round"`
	PartyData    map[string]interface{} `json:"party_data,omitempty"`
	Commitments  map[int]string         `json:"commitments,omitempty"` // Hex encoded
}

// SignResponse represents a signing response
type SignResponse struct {
	Success     bool                   `json:"success"`
	Round       int                    `json:"round"`
	Data        map[string]interface{} `json:"data,omitempty"`
	Signature   *SignatureData         `json:"signature,omitempty"`
	Error       string                 `json:"error,omitempty"`
}

// SignatureData represents the final signature
type SignatureData struct {
	C         string `json:"c"`          // Challenge (hex)
	Z         string `json:"z"`          // Response (hex)
	Delta     string `json:"delta"`      // Hint (hex)
	PublicKey string `json:"public_key"` // Public key (hex)
}

// Initialize the service
func NewRingtailService() (*RingtailService, error) {
	partyID := getEnvInt("PARTY_ID", 0)
	threshold := getEnvInt("THRESHOLD", 2)
	parties := getEnvInt("PARTIES", 3)

	service := &RingtailService{
		partyID:   partyID,
		threshold: threshold,
		parties:   parties,
		sessions:  make(map[string]*SigningSession),
	}

	// TODO: Initialize the actual Ringtail party
	// service.party = ringtail.NewParty(partyID, threshold, parties)

	log.Printf("Initialized Ringtail service - Party ID: %d, Threshold: %d, Parties: %d\n", 
		partyID, threshold, parties)

	return service, nil
}

// Handle signing requests
func (s *RingtailService) handleSign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, fmt.Errorf("invalid request: %v", err))
		return
	}

	log.Printf("Received sign request - Session: %s, Round: %d\n", req.SessionID, req.Round)

	switch req.Round {
	case 1:
		s.handleRound1(w, req)
	case 2:
		s.handleRound2(w, req)
	default:
		respondError(w, fmt.Errorf("invalid round: %d", req.Round))
	}
}

// Handle Round 1 (offline phase)
func (s *RingtailService) handleRound1(w http.ResponseWriter, req SignRequest) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if session already exists
	if _, exists := s.sessions[req.SessionID]; exists {
		respondError(w, fmt.Errorf("session %s already exists", req.SessionID))
		return
	}

	// Decode message
	message, err := hex.DecodeString(req.Message)
	if err != nil {
		respondError(w, fmt.Errorf("invalid message hex: %v", err))
		return
	}

	// Create new session
	session := &SigningSession{
		SessionID:   req.SessionID,
		Message:     message,
		StartTime:   time.Now(),
		Commitments: make(map[int][]byte),
	}

	// TODO: Call actual Ringtail Round 1
	// commitment, state := s.party.SignRound1()
	// session.Round1Data = state
	
	// For now, return mock data
	mockCommitment := make([]byte, 32)
	for i := range mockCommitment {
		mockCommitment[i] = byte(i)
	}

	session.Round1Done = true
	s.sessions[req.SessionID] = session

	response := SignResponse{
		Success: true,
		Round:   1,
		Data: map[string]interface{}{
			"party_id":    s.partyID,
			"commitment":  hex.EncodeToString(mockCommitment),
			"session_id":  req.SessionID,
		},
	}

	respondJSON(w, response)
}

// Handle Round 2 (online phase)
func (s *RingtailService) handleRound2(w http.ResponseWriter, req SignRequest) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check session exists
	session, exists := s.sessions[req.SessionID]
	if !exists {
		respondError(w, fmt.Errorf("session %s not found", req.SessionID))
		return
	}

	if !session.Round1Done {
		respondError(w, fmt.Errorf("round 1 not completed for session %s", req.SessionID))
		return
	}

	if session.Finalized {
		respondError(w, fmt.Errorf("session %s already finalized", req.SessionID))
		return
	}

	// Decode commitments from other parties
	for partyID, commitmentHex := range req.Commitments {
		commitment, err := hex.DecodeString(commitmentHex)
		if err != nil {
			respondError(w, fmt.Errorf("invalid commitment from party %d: %v", partyID, err))
			return
		}
		session.Commitments[partyID] = commitment
	}

	// TODO: Call actual Ringtail Round 2
	// signature := s.party.SignRound2(session.Round1Data, session.Commitments, session.Message)
	
	// For now, return mock signature
	mockSignature := &SignatureData{
		C:         hex.EncodeToString(make([]byte, 32)),
		Z:         hex.EncodeToString(make([]byte, 256)),
		Delta:     hex.EncodeToString(make([]byte, 64)),
		PublicKey: hex.EncodeToString(make([]byte, 128)),
	}

	session.Finalized = true

	response := SignResponse{
		Success:   true,
		Round:     2,
		Signature: mockSignature,
	}

	respondJSON(w, response)
}

// Get session status
func (s *RingtailService) handleStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		// Return all sessions
		s.mu.RLock()
		defer s.mu.RUnlock()

		sessions := make(map[string]interface{})
		for id, session := range s.sessions {
			sessions[id] = map[string]interface{}{
				"start_time":  session.StartTime,
				"round1_done": session.Round1Done,
				"finalized":   session.Finalized,
			}
		}

		respondJSON(w, map[string]interface{}{
			"party_id": s.partyID,
			"sessions": sessions,
		})
		return
	}

	// Return specific session
	s.mu.RLock()
	session, exists := s.sessions[sessionID]
	s.mu.RUnlock()

	if !exists {
		respondError(w, fmt.Errorf("session %s not found", sessionID))
		return
	}

	respondJSON(w, map[string]interface{}{
		"session_id":  session.SessionID,
		"start_time":  session.StartTime,
		"round1_done": session.Round1Done,
		"finalized":   session.Finalized,
	})
}

// Clean up old sessions
func (s *RingtailService) cleanupSessions() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for id, session := range s.sessions {
			if now.Sub(session.StartTime) > 30*time.Minute {
				delete(s.sessions, id)
				log.Printf("Cleaned up expired session: %s\n", id)
			}
		}
		s.mu.Unlock()
	}
}

// Health check endpoint
func handleHealth(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, map[string]interface{}{
		"status": "healthy",
		"time":   time.Now().UTC(),
	})
}

// Helper functions
func respondJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding response: %v\n", err)
	}
}

func respondError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(SignResponse{
		Success: false,
		Error:   err.Error(),
	})
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func main() {
	service, err := NewRingtailService()
	if err != nil {
		log.Fatalf("Failed to initialize service: %v", err)
	}

	// Start cleanup routine
	go service.cleanupSessions()

	// Set up routes
	http.HandleFunc("/sign", service.handleSign)
	http.HandleFunc("/status", service.handleStatus)
	http.HandleFunc("/health", handleHealth)

	// Add CORS middleware for development
	handler := corsMiddleware(http.DefaultServeMux)

	port := getEnvInt("PORT", 8080)
	log.Printf("Ringtail service listening on :%d\n", port)
	
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// Simple CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}