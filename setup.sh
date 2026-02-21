#!/bin/bash
set -e

echo "Anonamoose Setup"
echo "================"
echo ""

# Generate token if not set
if [ -z "$STATS_TOKEN" ]; then
    STATS_TOKEN=$(openssl rand -hex 32)
    echo "Generated STATS_TOKEN: $STATS_TOKEN"
fi

# Create .env file
cat > .env << EOF
# Anonamoose Environment Configuration
STATS_TOKEN=$STATS_TOKEN
API_TOKEN=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
EOF

echo ""
echo "Created .env file with STATS_TOKEN"
echo ""
echo "To start Anonamoose:"
echo "  make up"
echo ""
echo "Then visit:"
echo "  http://localhost:3102 (Dashboard - use token: $STATS_TOKEN)"
