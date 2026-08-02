FROM python:3.13.5-alpine3.22

WORKDIR /coordination/app
COPY coordination ./coordination

RUN addgroup -S coordination && adduser -S coordination -G coordination \
    && mkdir -p /coordination/data /coordination/mounts/workspaces \
    && chown -R coordination:coordination /coordination

USER coordination
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=2s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')"

CMD ["python", "-m", "coordination.main"]
