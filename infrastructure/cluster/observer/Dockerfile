FROM python:3.10-slim

# Install sshpass for non-interactive SSH
RUN apt-get update && apt-get install -y sshpass \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/neurocore /neurocore/data /neurocore/logs \
 && chown -R cluster:cluster /opt/neurocore /neurocore \
 && chmod -R 775 /opt/neurocore /neurocore

# Copy the polling scripts
COPY discover_jobs.py /opt/neurocore/discover_jobs.py
COPY poll_metrics.py /opt/neurocore/poll_metrics.py
COPY build_snapshot.py /opt/neurocore/build_snapshot.py
RUN chmod +x /opt/neurocore/*.py

WORKDIR /opt/neurocore