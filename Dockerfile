FROM node:26.7.0-slim

WORKDIR /app

# Copy package configurations and install
COPY package.json .
RUN npm install

# Copy source files
COPY . .

# Expose Vite port
EXPOSE 3000

# Start Vite dev server
CMD ["npm", "run", "dev"]
