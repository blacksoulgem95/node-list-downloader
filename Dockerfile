FROM node:lts-alpine
COPY . /app
WORKDIR /app
RUN npm ci
VOLUME /opt/config/downloads.txt
VOLUME /opt/output
ENV INPUT_FILE=/opt/config/downloads.txt
ENV DESTINATION_DIR=/opt/output
ENV DEBUG=false
ENV LANGUAGE=en

ENTRYPOINT ["npm", "start"]