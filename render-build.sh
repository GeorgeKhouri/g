#!/bin/bash
# Deploy script for Render

echo "Installing dependencies..."
npm install

echo "Starting server..."
node server.js
