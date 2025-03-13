FROM node:18-bullseye
LABEL org.opencontainers.image.source=https://github.com/openzim/phet

WORKDIR /phet

# Copy standalone files, especially package.json
COPY *.json *.md /phet/

# Install dependencies
RUN npm install

# Copy code
COPY lib /phet/lib
COPY steps /phet/steps
COPY res /phet/res

# Install phets scrapper
RUN npm install

# Boot commands
CMD cat README.md ; /bin/bash
