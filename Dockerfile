FROM node:22
LABEL org.opencontainers.image.source=https://github.com/openzim/phet

WORKDIR /phet

# Copy standalone files, especially package.json
COPY *.json *.md /phet/

# Install dependencies
RUN npm install

# Copy code
COPY bin /phet/bin
COPY lib /phet/lib
COPY steps /phet/steps
COPY res /phet/res
COPY .babelrc /phet

# Install phets scrapper
RUN npm run export-prebuild && npm install && npm link

CMD ["phet2zim"]

