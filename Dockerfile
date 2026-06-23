# Use the official Node.js light image
FROM node:18-alpine

# Create and define the working directory
WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application files
COPY . .

# Expose port 8080 (Cloud Run overrides PORT env anyway, but default is 8080)
EXPOSE 8080

# Start the application
CMD [ "npm", "start" ]
