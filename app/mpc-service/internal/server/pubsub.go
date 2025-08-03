package server

import (
	"fmt"

	"github.com/nats-io/nats.go"
)

// pubSubWrapper wraps NATS to implement messaging.PubSub
type pubSubWrapper struct {
	nc *nats.Conn
}

func (p *pubSubWrapper) Publish(topic string, data []byte) error {
	return p.nc.Publish(topic, data)
}

func (p *pubSubWrapper) Subscribe(topic string, handler func(msg *nats.Msg)) (interface{}, error) {
	sub, err := p.nc.Subscribe(topic, handler)
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe: %w", err)
	}
	return sub, nil
}

func (p *pubSubWrapper) PublishWithReply(topic, reply string, data []byte, headers map[string]string) error {
	msg := &nats.Msg{
		Subject: topic,
		Reply:   reply,
		Data:    data,
		Header:  nats.Header{},
	}
	for k, v := range headers {
		msg.Header.Set(k, v)
	}
	return p.nc.PublishMsg(msg)
}