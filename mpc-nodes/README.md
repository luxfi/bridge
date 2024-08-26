# teleport
Docker project for MPC nodes for Teleport bridge network.

## Features
Lux Teleport has the following features:

1. Decentralized oracle operations using MPC
2. Decentralized permissioning using MPC
3. Zero knowledge transactions, signers don't know details about assets being teleported to and from supported chains.

## Installation
Clone the repository on all signers.

```
git clone https://github.com/luxfi/mpc_nodes_docker
```

Install docker on your computer.

Build project.
```
docker compose build
```
Run project.
```
docker compose up -d
```
Stop process

```
docker compose down
```
## Key generation
Once project is running successfully on Docker, generate key shares in each containers.
Open bash from all the containers
```
docker compose exec mpc-node-0 /bin/bash
```
```
docker compose exec mpc-node-1 /bin/bash
```
```
docker compose exec mpc-node-2 /bin/bash
```
and run following command in each bash window to generate key shares
```
npm run keygen
```
## K8 running
convert compose.yaml using kompose command
```
kompose convert -f compose.yaml -o k8s/
```
```
kubectl apply -f ./k8s
```
# Show current k8 pods and services
```
kubectl get pods
```
```
kompose get services
```
# In local environment, forward your local port 8080 to the service's 8080 port
```
kubectl port-forward service/server 8080:8080
```
# Run a command inside a running pod in a Kubernetes cluster.
```
kubectl exec -it mpc-node-0 -- /bin/bash
```
```
kubectl exec -it mpc-node-1 -- /bin/bash
```
```
kubectl exec -it mpc-node-1 -- /bin/bash
```
# Run key generation command in each clustuer
```
npm run keygen
```
