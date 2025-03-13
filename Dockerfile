FROM node:18-bullseye
LABEL org.opencontainers.image.source=https://github.com/openzim/phet

WORKDIR /phet

# Copy code
COPY lib /phet/lib
COPY steps /phet/steps
COPY res /phet/res
COPY *.json *.md /phet/

# Install phets scrapper
RUN npm install

# Boot commands
CMD cat README.md ; /bin/bash
