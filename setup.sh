#!/bin/bash
set -e

echo "Anonamoose Setup"
echo "================"
echo ""

# Generate tokens if not set
if [ -z "$STATS_TOKEN" ]; then
    STATS_TOKEN=$(openssl rand -hex 32)
    echo "Generated STATS_TOKEN"
fi

if [ -z "$REDIS_PASSWORD" ]; then
    REDIS_PASSWORD=$(openssl rand -hex 16)
    echo "Generated REDIS_PASSWORD"
fi

# Create .env file
cat > .env << EOF
# Anonamoose Environment Configuration
STATS_TOKEN=$STATS_TOKEN
REDIS_PASSWORD=$REDIS_PASSWORD
API_TOKEN=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
EOF

echo ""
echo "Created .env file"
echo ""
echo "To start Anonamoose:"
echo "  make up"
echo ""
echo "Then visit:"
echo "  http://localhost:3100  (Proxy API)"
echo "  http://localhost:3101  (Management API)"
echo "  http://localhost:3102  (Dashboard - token: $STATS_TOKEN)"
