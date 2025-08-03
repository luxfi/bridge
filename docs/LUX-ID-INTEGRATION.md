# Lux ID Integration Guide

## Overview

The Lux Bridge now integrates with **Lux ID**, a Casdoor-based unified authentication system, providing centralized identity management across all Lux Network services.

## Services Added

### 1. Lux ID Service (Casdoor)
- **Container**: `bridge-lux-id`
- **Port**: 8000
- **Image**: `casbin/casdoor:latest`
- **Purpose**: Centralized authentication and identity management

### 2. Lux ID Database
- **Container**: `bridge-lux-id-db`
- **Port**: 5434
- **Image**: `postgres:15-alpine`
- **Purpose**: Persistent storage for user identities and authentication data

## Configuration

### Environment Variables

#### Bridge Server
```bash
AUTH_PROVIDER=casdoor
CASDOOR_ENDPOINT=http://lux-id:8000
CASDOOR_CLIENT_ID=lux-bridge
CASDOOR_CLIENT_SECRET=lux-bridge-secret
CASDOOR_ORGANIZATION=lux-network
CASDOOR_APPLICATION=bridge
```

#### Bridge UI
```bash
NEXT_PUBLIC_AUTH_PROVIDER=casdoor
NEXT_PUBLIC_CASDOOR_ENDPOINT=http://localhost:8000
NEXT_PUBLIC_CASDOOR_CLIENT_ID=lux-bridge
NEXT_PUBLIC_CASDOOR_ORGANIZATION=lux-network
NEXT_PUBLIC_CASDOOR_APPLICATION=bridge
NEXT_PUBLIC_CASDOOR_REDIRECT_URI=http://localhost:3000/auth/callback
```

## Getting Started

1. **Start all services**:
   ```bash
   make up
   ```

2. **Access Lux ID Admin Panel**:
   - URL: http://localhost:8000
   - Default admin: admin/123456 (change immediately in production)

3. **Configure Application**:
   - Create organization: `lux-network`
   - Create application: `bridge`
   - Configure OAuth2 settings

## Authentication Flow

1. User clicks "Login" in Bridge UI
2. Redirected to Lux ID login page
3. User authenticates with Lux ID credentials
4. Redirected back to Bridge with auth token
5. Bridge Server validates token with Lux ID
6. User gains access to protected resources

## Security Considerations

- Change default passwords immediately
- Use HTTPS in production
- Configure proper CORS settings
- Enable 2FA for admin accounts
- Regular security audits

## Integration Points

- **KMS**: Secure key storage with authentication
- **MPC Nodes**: Identity-based access control
- **Bridge API**: JWT token validation
- **Bridge UI**: OAuth2 authentication flow

## Troubleshooting

1. **Lux ID not starting**: Check database connection
2. **Authentication fails**: Verify client ID/secret
3. **Redirect issues**: Check CORS and redirect URI
4. **Token validation**: Ensure services can reach Lux ID

## Future Enhancements

- LDAP/AD integration
- SSO with other Lux services
- Multi-factor authentication
- Role-based permissions
- Audit logging