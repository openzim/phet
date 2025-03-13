FROM node:18

WORKDIR /phet

# Output directory, must exists beforehand for now
RUN mkdir /phet/dist

# Copy standalone files, especially package.json
COPY *.json *.md /phet/

# Install dependencies
RUN npm install

# Copy code
COPY lib /phet/lib
COPY steps /phet/steps
COPY res /phet/res
COPY .babelrc /phet

# Install phets scrapper
RUN npm run export-prebuild && npm install

# Boot commands
CMD cat README.md ; /bin/bash
