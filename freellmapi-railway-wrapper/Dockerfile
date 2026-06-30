FROM ghcr.io/tashfeenahmed/freellmapi:latest

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=3001
ENV HOST_BIND=0.0.0.0
ENV FREEAPI_DB_PATH=/app/server/data/freellmapi.db

COPY docker-entrypoint.sh /usr/local/bin/freellmapi-railway-entrypoint.sh
RUN chmod 0755 /usr/local/bin/freellmapi-railway-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/freellmapi-railway-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
