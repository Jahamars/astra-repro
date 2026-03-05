FROM debian:stable

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      curl jq python3 dpkg-dev fakeroot \
      build-essential devscripts \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN echo "deb http://deb.debian.org/debian stable main" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian stable-updates main" >> /etc/apt/sources.list && \
    echo "deb http://security.debian.org/debian-security stable-security main" >> /etc/apt/sources.list && \
    echo "deb-src http://deb.debian.org/debian stable main" >> /etc/apt/sources.list
