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
ENV EXTRACTOR_TYPE=ARCHIVE_ORG
ENV EXTRACTOR_TYPE=ARCHIVE_ORG
ENV EXTRACTOR_OUTPUT=/opt/output/downloads.txt
ENV EXTRACTOR_WRITE_FLAG=a

ENTRYPOINT ["npm", "start"]