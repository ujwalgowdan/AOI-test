# syntax=docker/dockerfile:1.7
# Production frontend (F-03): static build served by nginx. Dev keeps using
# the Vite dev server from docker-compose.yml; this file is only used by
# docker-compose.prod.yml.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Station token is baked in at build time (see .env.example, F-05). Empty = off.
ARG VITE_STATION_TOKEN=""
ENV VITE_STATION_TOKEN=$VITE_STATION_TOKEN
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
