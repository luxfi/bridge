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

    2.	Install Dependencies:

pnpm install (from root or any project subdir)

## Development

- go into server dir

  `cd server`

- generate prisma artifacts

  `pnpx prisma generate`

- set up prisma to use sqlite

  in `prisma/schema.prisma`

```
datasource db {
  //provider  = "postgresql"
  provider  = "sqlite"
  url       = env("POSTGRESQL_URL")
  directUrl = env("POSTGRESQL_URL")
}
```

- set env variable to point to sqlite

  in `.env`

  `POSTGRESQL_URL=file:./dev.sqlite`

- create the local `sqlite` instance

  `pnpx prisma db push`

- Start the dev server

  `pnpm dev`

This command uses nodemon to watch for file changes and restarts the server automatically.

```
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): src/**/*
[nodemon] watching extensions: ts,js
[nodemon] starting `node -r tsconfig-paths/register -r ts-node/register ./src/server.ts`
>> Server is Running At: Port 5000
```

## Building the Project

    •	Build the Project:

pnpm build

This command compiles TypeScript files, resolves module aliases, and generates the Prisma client.

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

Ensure the POSTGRESQL_URL environment variable is set with your PostgreSQL connection string.

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

POSTGRESQL_URL=your_postgres_connection_string
GH_USER=your_github_username
GH_TOKEN=your_github_token
REPLICAS=number_of_replicas

Ensure that sensitive information is kept secure and not committed to version control.
