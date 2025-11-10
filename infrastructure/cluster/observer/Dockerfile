FROM python:3.10-slim

RUN apt-get update && apt-get install -y sshpass \
    && rm -rf /var/lib/apt/lists/*

RUN pip install pyyaml

RUN mkdir -p /opt/neurocore

COPY *.py /opt/neurocore/

RUN chmod +x /opt/neurocore/*.py

WORKDIR /opt/neurocore