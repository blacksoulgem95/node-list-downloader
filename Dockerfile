FROM node:lts
COPY . /app
WORKDIR /app
RUN npm ci
VOLUME /opt/config/downloads.txt
VOLUME /opt/output
ENV INPUT_FILE = /opt/config/downloads.txt
ENV DESTINATION_DIR = /opt/output

ENTRYPOINT ["npm", "start"]