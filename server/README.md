# bridge/server

> The Lux Bridge Server is an API server that facilitates communication with Multi-Party Computation (MPC) nodes and manages asset swaps.

## Prerequisites

	•	Node.js: Version 20 or higher.
	•	pnpm: Version 9.10.0 or higher.
	•	Docker: Ensure Docker is installed and running.
	•	Kubernetes: Access to a Kubernetes cluster for deployment.

## Installation

	1.	Clone the Repository:

git clone https://github.com/luxfi/bridge.git
cd bridge/server


	2.	Install Dependencies:

pnpm install

## Development

	•	Start the Development Server:

pnpm dev

This command uses nodemon to watch for file changes and restarts the server automatically.

## Building the Project

	•	Build the Project:

pnpm build

This command compiles TypeScript files, resolves module aliases, and generates the Prisma client.

## Database Management

	•	Run Database Scripts:

pnpm db

This command executes the dist/db.js script for database operations.

## Docker Operations

	•	Build Docker Image:

pnpm docker:build

This command builds the Docker image using Buildx for the linux/amd64 platform.

	•	Log in to GitHub Container Registry:

pnpm docker:login

Ensure that the environment variables GH_USER and GH_TOKEN are set with your GitHub username and personal access token, respectively.

	•	Push Docker Image:

pnpm docker:push

This command pushes the Docker image to the GitHub Container Registry.

## Kubernetes Deployment

	•	Apply Kubernetes Configuration:

pnpm k8s:apply

This command applies the Kubernetes deployment and service configurations located in the k8s directory.

	•	Scale Deployment:

pnpm k8s:scale

Set the REPLICAS environment variable to the desired number of replicas before running this command.

	•	Create Kubernetes Secret:

pnpm k8s:create-secret

Ensure the POSTGRES_URL environment variable is set with your PostgreSQL connection string.

	•	Restart Deployment:

pnpm k8s:restart

	•	Check Deployment Status:

pnpm k8s:status

This command retrieves the status of deployments, services, and pods labeled app=bridge-server.

## Linting and Formatting

	•	Lint Code:

pnpm lint

	•	Format Code:

pnpm format

## Environment Variables

The server utilizes environment variables for configuration. Create a .env file in the server directory with the following variables:

POSTGRES_URL=your_postgres_connection_string
GH_USER=your_github_username
GH_TOKEN=your_github_token
REPLICAS=number_of_replicas

Ensure that sensitive information is kept secure and not committed to version control.
