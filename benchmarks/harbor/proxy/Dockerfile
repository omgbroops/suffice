FROM python:3.12-slim
COPY openai_proxy.py /usr/local/bin/suffice-openai-proxy
RUN chmod 755 /usr/local/bin/suffice-openai-proxy
ENTRYPOINT ["/usr/local/bin/suffice-openai-proxy"]
