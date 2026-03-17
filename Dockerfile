FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for pdfplumber/other packages if needed
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    locales \
    && rm -rf /var/lib/apt/lists/*

RUN sed -i -e 's/# es_ES.UTF-8 UTF-8/es_ES.UTF-8 UTF-8/' /etc/locale.gen && \
    sed -i -e 's/# de_DE.UTF-8 UTF-8/de_DE.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose port 8501 for Streamlit
EXPOSE 8501

# Command to run the application
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
