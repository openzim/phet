FROM openzim/zimwriterfs:latest

# Install necessary packages
RUN apt-get update && \
    apt-get install -y advancecomp make g++ curl git

# Install npm & nodejs
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -
RUN apt-get install -y nodejs

# Install jpegoptim
RUN apt-get install -y libjpeg-dev
RUN wget http://www.kokkonen.net/tjko/src/jpegoptim-1.4.4.tar.gz
RUN tar xvf jpegoptim-1.4.4.tar.gz
RUN cd jpegoptim-1.4.4 && ./configure
RUN cd jpegoptim-1.4.4 && make all install

# Install pngquant
RUN apt-get install -y libpng-dev
RUN wget http://pngquant.org/pngquant-2.9.0-src.tar.gz
RUN tar xvf pngquant-2.9.0-src.tar.gz
RUN cd pngquant-2.9.0 && ./configure
RUN cd pngquant-2.9.0 && make all install

# Install gifsicle
RUN wget https://www.lcdf.org/gifsicle/gifsicle-1.88.tar.gz
RUN tar xvf gifsicle-1.88.tar.gz
RUN cd gifsicle-1.88 && ./configure
RUN cd gifsicle-1.88 && make all install

# Install phets scrapper
RUN git clone --depth=1 https://github.com/openzim/phet.git
RUN cd phet && npm install

# Boot commands
CMD cd phet && cat README.md ; /bin/bash
