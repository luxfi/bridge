# Use Node.js for the final image
FROM node:20

# Set working directory in Node container  
WORKDIR /app

# Copy only necessary files to avoid caching issues
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the app files
COPY ./ . 

# Build the app (ensure this script exists in package.json)
RUN npm run build

# Expose the port the app runs on
EXPOSE 6000

# Command to run the application
CMD ["node", "dist/server.js"]  # Update this path to match your output file if different
