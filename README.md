# 🚌 TicketKini - Advanced Travel Booking System

<div align="center">

![TicketKini Logo](frontend/assets/images/logo.png)

**Professional-grade travel booking platform with modern architecture and advanced database design**

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-FCA121?style=for-the-badge&logo=python&logoColor=white)](https://sqlalchemy.org)

[🚀 Live Demo](https://dbms-project-ljy4.onrender.com) • [📖 API Docs](https://dbms-project-ljy4.onrender.com/docs) • [🎯 Features](#-key-features) • [⚡ Quick Start](#-quick-start)

</div>

---

## 🎯 Overview

**TicketKini** is a comprehensive, full-stack travel booking system that demonstrates advanced database management concepts in a real-world application. Built with modern technologies and best practices, it showcases professional-grade software development from database design to user interface.


### 🌟 Why TicketKini?

In the era of digital transformation, travel booking systems require sophisticated database management, real-time processing, and seamless user experiences. TicketKini addresses these challenges by providing:

- **🏗️ Advanced DBMS Concepts**: Normalized schema (3NF+), complex relationships, and optimized queries
- **⚡ Real-time Operations**: Live seat availability, instant notifications, and dynamic pricing
- **🔒 Enterprise Security**: JWT authentication, data validation, and secure payment processing
- **📊 Analytics-Ready**: Comprehensive booking analytics and performance metrics
- **🎨 Modern UX**: Responsive design with interactive seat maps and smooth animations

---

## 📸 Application Screenshots

### 🏠 **Landing Page - Your Gateway to Seamless Travel**

![TicketKini Landing Page](frontend/assets/images/screenshots/landing-page.png)

*Experience our intuitive search interface with multi-modal transport options (Bus, Train, Plane) and user-friendly booking system designed for seamless travel planning across Bangladesh.*

---

## ✨ Key Features

### 🚀 **Core Booking System**
- **Smart Search Engine**: Multi-criteria search with filters (date, time, price, operator)
- **Interactive Seat Maps**: Real-time seat selection with live availability updates
- **Booking Lifecycle Management**: Complete CART → PENDING → CONFIRMED/CANCELLED flow
- **Multi-passenger Support**: Bulk booking with individual passenger details
- **Dynamic Pricing**: Schedule-based pricing with coupon system

### 🛡️ **Authentication & Security**
- **JWT-based Authentication**: Secure token-based user sessions
- **Role-based Access Control**: User and Admin privilege separation
- **Data Validation**: Comprehensive input validation using Pydantic
- **Secure Password Handling**: Bcrypt hashing with salt
- **Session Management**: Token refresh and expiry handling

### 📊 **Advanced Database Features**
- **Normalized Schema**: 3NF+ compliance with referential integrity
- **Complex Relationships**: Multi-table joins with proper foreign key constraints
- **JSONB Integration**: Efficient storage for seat maps and pricing data
- **Transactional Integrity**: ACID compliance for booking and payment flows
- **Performance Optimization**: Strategic indexing and query optimization

### 🌐 **Real-time Communication**
- **WebSocket Integration**: Live notifications and updates
- **Background Tasks**: Automated cleanup and reminder systems
- **Event-driven Architecture**: Asynchronous processing for better performance
- **Connection Management**: Automatic reconnection and stale connection cleanup

### 👑 **Administrative Features**
- **Comprehensive Admin Dashboard**: Vehicle, schedule, and user management
- **Analytics & Reporting**: Booking statistics and revenue tracking
- **Content Management**: Operator management and feedback moderation
- **System Monitoring**: Real-time system health and performance metrics

---

## 🛠️ Technology Stack

### 🎯 **Backend Architecture**
```yaml
Framework: FastAPI (Modern Python Web Framework)
ORM: SQLAlchemy 2.x (Async ORM)
Database: PostgreSQL (Enterprise-grade RDBMS)
Authentication: JWT with python-jose
Password Security: Passlib with Bcrypt
Validation: Pydantic v2 (Type-safe data validation)
WebSockets: Native FastAPI WebSocket support
Background Tasks: Asyncio-based task management
```

### 🎨 **Frontend Stack**
```yaml
Languages: TypeScript, HTML5, CSS3
Build Tool: Vite (Next-generation frontend tooling)
Styling: Tailwind CSS (Utility-first CSS framework)
Components: Modular TypeScript components
State Management: LocalStorage with API synchronization
Animations: Custom CSS animations and transitions
```

### 🗄️ **Database Design**
```yaml
Primary Database: PostgreSQL 14+
ORM Layer: SQLAlchemy with async support
Connection Pool: asyncpg (High-performance async driver)
Schema Design: 3NF+ normalization
JSON Support: JSONB for complex data structures
Indexing Strategy: Optimized for search and booking queries
```

### ☁️ **Infrastructure & Deployment**
```yaml
Hosting: Render.com (Cloud hosting)
Environment: Production-ready configuration
Database: Managed PostgreSQL
Static Assets: CDN-optimized delivery
Monitoring: Application logging and error tracking
```

---

## 📊 Database Architecture

### 🏗️ **Schema Overview**

Our database follows strict normalization principles while maintaining performance through strategic denormalization where appropriate.

#### **Core Entities**
- **Users**: Authentication and profile management
- **Operators**: Transport company management
- **Vehicles**: Fleet management with seat configurations
- **Schedules**: Route and timing management
- **Bookings**: Complete booking lifecycle
- **Payments**: Transaction management
- **Locations**: Geographic route endpoints
- **Feedback**: User experience tracking
- **Notifications**: Real-time communication

###  **Performance Optimizations**

#### **Strategic Indexing**
```sql
-- High-performance indexes for common queries
CREATE INDEX idx_bookings_schedule_travel_status ON bookings(schedule_id, travel_date, status);
CREATE INDEX idx_schedules_route_active ON schedules(source_id, destination_id, is_active);
CREATE INDEX idx_vehicles_operator_type ON vehicles(operator_id, vehicle_type);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
```

#### **Query Optimization Strategies**
- **Eager Loading**: Minimize N+1 queries through strategic joins
- **Pagination**: Efficient limit/offset with proper sorting
- **Caching**: Redis-ready architecture for session and query caching
- **Connection Pooling**: Optimized database connection management

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph "Frontend Layer"
        A[Browser Client]
        B[Vite Dev Server]
        C[TypeScript Components]
        D[Tailwind CSS]
    end
    
    subgraph "API Layer"
        E[FastAPI Application]
        F[JWT Authentication]
        G[WebSocket Manager]
        H[Background Tasks]
    end
    
    subgraph "Business Logic"
        I[Booking Service]
        J[Payment Service]
        K[Notification Service]
        L[Email Service]
    end
    
    subgraph "Data Layer"
        M[SQLAlchemy ORM]
        N[PostgreSQL Database]
        O[Connection Pool]
    end
    
    A --> E
    B --> C
    C --> D
    E --> F
    E --> G
    E --> H
    E --> I
    I --> J
    I --> K
    K --> L
    I --> M
    M --> N
    M --> O
    
    G -.-> A
    H -.-> K
```

### 🔄 **Data Flow Architecture**

1. **Request Processing**: FastAPI handles HTTP requests with automatic validation
2. **Authentication**: JWT tokens provide secure, stateless authentication
3. **Business Logic**: Service layer processes complex business rules
4. **Data Access**: SQLAlchemy ORM manages database interactions
5. **Real-time Updates**: WebSockets provide live updates to connected clients
6. **Background Processing**: Async tasks handle notifications and cleanup

---

## 🚀 Quick Start

### 📋 Prerequisites

```bash
# Required Software
Python 3.9+
Node.js 16+
PostgreSQL 14+
Git
```

### ⚡ Installation

#### **1. Clone Repository**
```bash
git clone https://github.com/Rushu41/DBMS-Project.git
cd DBMS-Project
```

#### **2. Backend Setup**
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows)
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment variables
copy .env.example .env
# Edit .env with your database credentials
```

#### **3. Database Configuration**
```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE ticketkini;"

# Initialize database schema
python -c "from backend.database.init_db import init_db; import asyncio; asyncio.run(init_db())"
```

#### **4. Frontend Setup**
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

#### **5. Start Services**
```bash
# Backend (in backend directory)
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (in frontend directory)  
npm run dev
```

### 🌐 **Access Points**
- **Frontend**: http://127.0.0.1:5173
- **Backend API**: http://127.0.0.1:8000
- **API Documentation**: http://127.0.0.1:8000/docs
- **Alternative Docs**: http://127.0.0.1:8000/redoc

---

## 🗂️ Project Structure

```
TicketKini/
├── 📁 backend/                          # FastAPI Backend
│   ├── 📁 database/                     # Database Layer
│   │   ├── 📁 models/                   # SQLAlchemy Models
│   │   │   ├── user.py                  # User model
│   │   │   ├── vehicle.py               # Vehicle models
│   │   │   ├── booking.py               # Booking model
│   │   │   ├── schedule.py              # Schedule model
│   │   │   ├── payment.py               # Payment model
│   │   │   ├── location.py              # Location model
│   │   │   └── feedback.py              # Feedback model
│   │   ├── database.py                  # Database connection
│   │   └── init_db.py                   # Database initialization
│   ├── 📁 models/                       # Pydantic Models
│   │   ├── user.py                      # User schemas
│   │   ├── booking.py                   # Booking schemas
│   │   ├── vehicle.py                   # Vehicle schemas
│   │   └── payment.py                   # Payment schemas
│   ├── 📁 routes/                       # API Endpoints
│   │   ├── auth.py                      # Authentication
│   │   ├── booking.py                   # Booking management
│   │   ├── search.py                    # Search functionality
│   │   ├── payment.py                   # Payment processing
│   │   ├── admin.py                     # Admin operations
│   │   ├── feedback.py                  # Feedback system
│   │   └── notification.py              # Notifications
│   ├── 📁 services/                     # Business Logic
│   │   ├── booking_service.py           # Booking operations
│   │   ├── payment_service.py           # Payment processing
│   │   ├── email_service.py             # Email notifications
│   │   ├── notification_service.py      # Push notifications
│   │   └── websocket_service.py         # Real-time communication
│   ├── 📁 middleware/                   # Custom Middleware
│   │   ├── cors.py                      # CORS configuration
│   │   ├── jwt_auth.py                  # JWT authentication
│   │   └── logger.py                    # Request logging
│   ├── config.py                        # Configuration management
│   ├── main.py                          # Application entry point
│   └── requirements.txt                 # Python dependencies
├── 📁 frontend/                         # TypeScript Frontend
│   ├── 📁 pages/                        # Page Components
│   │   ├── index.html                   # Landing page
│   │   ├── search.html                  # Search interface
│   │   ├── booking.html                 # Booking page
│   │   ├── payment.html                 # Payment processing
│   │   ├── my-bookings.html             # User bookings
│   │   ├── profile.html                 # User profile
│   │   ├── admin.html                   # Admin dashboard
│   │   └── notifications.html           # Notifications
│   ├── 📁 components/                   # Reusable Components
│   │   ├── navbar.ts                    # Navigation component
│   │   ├── seatMap.ts                   # Seat selection
│   │   ├── modal.ts                     # Modal dialogs
│   │   └── button.ts                    # Button components
│   ├── 📁 services/                     # Frontend Services
│   │   ├── api.ts                       # API communication
│   │   ├── utils.ts                     # Utility functions
│   │   ├── notificationService.ts       # Notification handling
│   │   └── loyalty.ts                   # Loyalty program
│   ├── 📁 styles/                       # Styling
│   │   ├── site.css                     # Global styles
│   │   └── components/                  # Component styles
│   ├── 📁 assets/                       # Static Assets
│   │   └── images/                      # Image resources
│   ├── package.json                     # Frontend dependencies
│   ├── tsconfig.json                    # TypeScript configuration
│   └── vite.config.js                   # Vite configuration
├── 📁 sql/                              # Database Scripts
│   ├── migrations/                      # Schema migrations
│   └── seed_data.sql                    # Initial data
├── render.yaml                          # Deployment configuration
├── runtime.txt                          # Python runtime specification
└── README.md                           # This documentation
```

---

## 🔧 Configuration & Environment

### 🌍 **Environment Variables**

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost/ticketkini
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=ticketkini

# Security Configuration
SECRET_KEY=your-super-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Email Configuration (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Application Settings
DEBUG=False
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:5173"]
MAX_BOOKING_SEATS=6
BOOKING_EXPIRY_MINUTES=15
```

### 🚀 **Production Deployment**

#### **Render.com Deployment**
```yaml
# render.yaml
services:
  - type: web
    name: ticketkini-backend
    env: python
    buildCommand: pip install -r backend/requirements.txt
    startCommand: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: ticketkini-db
          property: connectionString
      - key: SECRET_KEY
        generateValue: true
      - key: JWT_SECRET_KEY
        generateValue: true

databases:
  - name: ticketkini-db
    databaseName: ticketkini
    user: ticketkini_user
```

---

## 👥 Contributors

Below are the primary contributors to TicketKini for this project.

| Profile | Developer | GitHub | Key Contributions |
|---------|-----------|--------|-------------------|
| <img src="https://github.com/SHJony121.png" width="80" height="80" style="border-radius: 50%;"> | **Md. Shahria Hasan Jony** | [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/SHJony121) | 🎨 **Frontend & UI/UX Design**<br/>• Search & booking interface<br/>• Interactive seat selection maps<br/>📱 **User Dashboard**<br/>• My Bookings management<br/>• User profile system<br/>⚙️ **Frontend Integration**<br/>• API integration with backend<br/>• Real-time data synchronization |
| <img src="https://github.com/Rushu41.png" width="80" height="80" style="border-radius: 50%;"> | **Md. Rushan Jamil** | [![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Rushu41) | 🏗️ **System Architecture**<br/>• Complete database design & schema<br/>📊 **Backend Development**<br/>• FastAPI REST API implementation<br/>• JWT authentication system<br/>🔔 **Real-time Features**<br/>• WebSocket notifications<br/>🚀 **DevOps & Deployment**<br/>• Production deployment setup<br/>⚡ **Database Management**<br/>• PostgreSQL optimization & queries |
- **Cloud Technologies**: Render.com deployment, environment management
- **Version Control**: Git workflow, branching strategies, CI/CD
- **Security**: JWT authentication, password hashing, data validation

### 🎨 **SH Jony - Co-Developer & Frontend Specialist**

#### **Key Contributions**
- **🎨 UI/UX Design**: Modern interface design and user experience optimization
- **📱 Frontend Development**: Interactive components and responsive layouts
- **🎯 Component Architecture**: Reusable component design and implementation
- **📊 Data Visualization**: Dashboard components and analytics interfaces
- **🔧 Frontend Integration**: API integration and state management
- **🎪 Animation & Interactions**: Smooth animations and user interactions
- **📝 Content Management**: User interface content and documentation
- **🧪 Frontend Testing**: Component testing and user experience validation

#### **Technical Skills**
- **Frontend Technologies**: TypeScript, JavaScript, HTML5, CSS3
- **UI Frameworks**: Tailwind CSS, responsive design principles
- **Component Development**: Modular component architecture
- **State Management**: Frontend data management and API integration
- **Design Tools**: Modern UI/UX design principles
- **Testing**: Frontend testing frameworks and methodologies

### 🎓 **Academic Context**

This project was developed as part of a **Database Management Systems (DBMS)** course project by a collaborative team, demonstrating:

- **Advanced Database Concepts**: Normalization, indexing, transaction management
- **Real-world Application**: Practical implementation of theoretical concepts
- **Modern Development Practices**: Agile methodology, version control, documentation
- **Professional Standards**: Code quality, testing, deployment practices
- **Team Collaboration**: Distributed development and integration practices

### 🤝 **Team Collaboration**

The development process showcased effective teamwork with:
- **Role Distribution**: Clear separation of responsibilities between backend and frontend
- **Code Integration**: Seamless integration of different components
- **Quality Assurance**: Peer code review and collaborative testing
- **Documentation**: Joint effort in creating comprehensive documentation
- **Problem Solving**: Collaborative debugging and feature development

---

<div align="center">

### 🌟 **Built with ❤️ for the Developer Community**

*"Demonstrating that academic projects can meet professional standards while advancing database management knowledge."*

---

**⭐ Star this repository if you found it helpful!**

**🔄 Fork it to build your own travel booking platform!**

**🤝 Contribute to make it even better!**

</div>

---

<div align="center">
<sub>© 2024 Md. Rushan Jamil & SH Jony. Built as part of DBMS coursework with professional-grade implementation standards.</sub>
</div>
