FROM python:3.10-slim

# Install sshpass for non-interactive SSH
RUN apt-get update && apt-get install -y sshpass \
    && rm -rf /var/lib/apt/lists/*

# Copy the polling scripts
COPY discover_jobs.py /opt/neurocore/discover_jobs.py
COPY poll_metrics.py /opt/neurocore/poll_metrics.py
RUN chmod +x /opt/neurocore/*.py

WORKDIR /opt/neurocore