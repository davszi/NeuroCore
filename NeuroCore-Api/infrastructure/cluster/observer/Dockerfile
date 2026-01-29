FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y sshpass \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir paramiko pyyaml pytz

RUN useradd -ms /bin/bash cluster \
 && echo 'cluster:cluster' | chpasswd

RUN mkdir -p /opt/neurocore

COPY *.py /opt/neurocore/

RUN chmod +x /opt/neurocore/*.py

WORKDIR /opt/neurocore

CMD ["/bin/bash"]