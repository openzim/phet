FROM node:12

# Install phets scrapper
RUN git clone --depth=1 https://github.com/openzim/phet.git
RUN cd phet && npm install

# Boot commands
CMD cd phet && cat README.md ; /bin/bash
