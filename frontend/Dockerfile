# frontend/Dockerfile
# Stage 1: build the Vite app
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Set backend URL for the production build
# This gets embedded at build time
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine

# Copy build output
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config that:
# 1. Serves the React SPA (all routes → index.html)
# 2. Proxies /api/* to the backend service
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
