# Litu Vault

Client UI / Apps     │
                       └───────────┬────────────┘
                                   │
                     ┌─────────────▼─────────────┐
                     │    API Gateway / Auth     │
                     └─────────────┬─────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Medical Service │       │Sports & Athlete │       │Inventory/Supply │
│ (EHR, Billing)  │       │ (Wearables/IoT) │       │ (Stock, Vendor) │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Relational DB   │       │ Time-Series DB  │       │ Document / Rel  │
│ (PostgreSQL)    │       │ (InfluxDB/Mongo)│       │ (PostgreSQL/DB) │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─────────────────► ┌─────▼─────┐ ◄─────────────────┘
                             │Event Bus  │ (Kafka / RabbitMQ)
                             └───────────┘


Core Components of the Architecture

1. The Microservices Layer (Separation of Concerns)

Medical & EHR Service (Java/Spring Boot or .NET Core): Handles patient records, billing, and prescriptions. Built using languages that favor strict typing, high security, and enterprise data control.

Inventory Service (Node.js or Go): Tracks asset allocation, medication batches, stock thresholds, and suppliers. Go or Node.js offers fast execution loops for rapid barcode scanning and real-time ledger updates.

Sports Management Service (Python/FastAPI): Tracks athlete metrics, scheduling, and training workloads. Python is chosen here due to its dominance in data science, predictive injury modeling, and machine learning libraries.

2. The Multi-Database Strategy (Polyglot Persistence)

Using one database for everything creates massive performance bottlenecks. Instead, give each service its own optimized database:

Medical Data: Use a relational database like PostgreSQL. It guarantees data integrity for financial billing and patient safety records.

Inventory Ledger: Use PostgreSQL or MySQL with strict row-locking to ensure two clinics cannot pull the exact same last box of medicine simultaneously.

Sports & Wearables Data: Use a time-series database like InfluxDB or a NoSQL database like MongoDB. Wearables generate thousands of continuous data points (heart rate, GPS coordinates). Relational databases choke on this, but time-series databases handle it instantly.

3. The Event-Driven Core (Asynchronous Communication)

The services must talk to each other without slowing each other down. Use an event broker like Apache Kafka or RabbitMQ:

Example Workflow: An athlete gets injured on the field. The coach logs it in the Sports Service. The Sports Service publishes an event: Athlete_Injured.

The Medical Service listens to this event and instantly creates an emergency admission file for the doctor.

The Inventory Service listens and auto-allocates a pair of crutches and athletic tape to that patient's incoming ID.

Technical Tech Stack Recommendation

Frontend: React or Angular (Web dashboards for doctors & coaches); Flutter or React Native (Mobile app for athletes on the field).

API Gateway: Kong or AWS API Gateway (Handles unified routing, rate limiting, and global user authentication via OAuth2/OIDC).

Containerization: Docker and Kubernetes to deploy, scale, and manage the independent services seamlessly.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5df78d6b-fa29-4689-be7d-f3d03355b00f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
