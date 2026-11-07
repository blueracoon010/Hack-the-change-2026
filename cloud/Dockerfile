# Backend API + ML model in one container. Build from the REPO ROOT:
#   docker build -f cloud/Dockerfile -t spark-api .
# Set --build-arg TRAIN_MODEL=0 to skip downloading AESO data + training during the build (forecast endpoint then returns 503).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY backend/requirements.txt backend/requirements-ml.txt backend/
COPY ml/requirements.txt ml/
RUN pip install --no-cache-dir -r backend/requirements-ml.txt

COPY backend backend
COPY ml ml

# Train inside the image so the model matches this exact Python + scikit-learn version.
ARG TRAIN_MODEL=1
RUN if [ "$TRAIN_MODEL" = "1" ]; then python ml/fetch_aeso.py --days 365 && cd ml && python train.py; fi

WORKDIR /srv/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
