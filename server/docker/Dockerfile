# Use alpine as supports platforms we care about
FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory in Node container
WORKDIR /app

# Copy only necessary files to avoid caching issues
COPY package*.json ./

# Install Node.js dependencies
RUN pnpm install

# Copy the rest of the app files
COPY ./ .

# Build the app (ensure this script exists in package.json)
RUN pnpm run build

# Expose the port the app runs on
EXPOSE 6000

# Command to run the application
CMD ["pnpm", "start"]
