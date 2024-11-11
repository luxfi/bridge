# bridge/server

> Lux Bridge API server powered Teleport protocol.

Lux Bridge is a modular, high-performance decentralized bridge protocol powered
by Teleport protocol.

It facilitates secure, scalable asset transfers across blockchain networks, leveraging advanced AI integrations, decentralized finance protocols, and a multi-functional SDK. Lux Bridge supports NFTs, Ethereum, and Lux Network token standards, making it ideal for swaps, exchanges, and seamless bridging of assets.

Project Overview

	•	App: The main application interface for user interaction.
	•	Explorer: Provides visibility and insights into bridge transactions and blockchain interactions.
	•	SDK: A developer-friendly toolkit for interacting with Lux Bridge APIs, enabling custom integrations and programmatic access.

Prerequisites

Ensure you have the following installed:
	•	Node.js (>= 18) and pnpm (>= 8)
	•	Docker (for deployment and image creation)
	•	Kubernetes (for cloud deployment)

Getting Started

1. Clone the Repository

git clone https://github.com/luxfi/bridge.git
cd bridge/server

2. Install Dependencies

The project uses pnpm as its package manager. Run the following to install all dependencies:

pnpm install

3. Build the Project

Lux Bridge has multiple packages that need to be built. You can build all at once or individual packages as needed.

Build All Packages

pnpm build:all

4. Start the Development Server

To start the application locally for development, use the dev command:

pnpm dev

5. Production Start

To start the app in production mode:

pnpm start

## Docker Usage

Lux Bridge supports Docker for containerized deployments. Use the following commands to build and push the Docker image to GitHub Container Registry (GHCR).

Build and Push Docker Image

pnpm docker:build
pnpm docker:push

## Kubernetes Deployment

This project includes configurations for deploying to a Kubernetes cluster. After pushing the Docker image to GHCR, you can apply the Kubernetes configuration to update the deployment.

Apply Kubernetes Configuration

pnpm k8s:apply

Project Structure

	•	/app: Main user-facing application with a rich UI.
	•	/explorer: Blockchain transaction explorer.
	•	/sdk: Developer SDK for interacting with Lux Bridge programmatically.

Additional Information

	•	Node.js Version: Set to >=18 as defined in .nvmrc for consistency.
	•	React and TailwindCSS: Core libraries for frontend styling and UI components.
	•	Ethers.js: Utilized for Ethereum-based blockchain interactions.
	•	TypeScript: For strong typing and maintaining consistency across the codebase.

Contribution Guidelines

	1.	Fork the repository.
	2.	Create a feature branch: git checkout -b feature-name.
	3.	Commit your changes: git commit -m 'Add new feature'.
	4.	Push to your branch: git push origin feature-name.
	5.	Submit a pull request.

Lux Bridge empowers developers and end-users to bridge assets with ease. For
more information, visit [Lux Partners](https://lux.partners).
