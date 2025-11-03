# Microservices Authentication Guide

This guide explains how to authenticate requests between the SaaS Scaffolding frontend and your microservices.

## Overview

The authentication system uses JWT (JSON Web Tokens) with refresh tokens:

- **Access Tokens**: Short-lived (1 hour) JWT tokens for API requests
- **Refresh Tokens**: Long-lived (7 days) tokens stored in database for token renewal
- **Permissions**: Included in access token payload, validated against database

## Architecture

```
Frontend (Next.js)
    ↓ (obtains JWT via /api/microservices/token)
    ↓ (sends JWT in Authorization header)
    
Microservice (Any Language)
    ↓ (validates JWT with shared JWT_SECRET)
    ↓ (extracts userId, orgId, role, permissions)
    ↓ (processes request)
```

## Frontend Usage (Next.js)

### 1. Obtain Access Token

```typescript
// Get access and refresh tokens
const response = await fetch('/api/microservices/token', {
  method: 'POST',
  credentials: 'include', // Important: includes session cookie
});

const { accessToken, refreshToken, expiresIn } = await response.json();

// Store tokens (consider using secure storage)
localStorage.setItem('microservice_access_token', accessToken);
localStorage.setItem('microservice_refresh_token', refreshToken);
```

### 2. Use Token in API Requests

```typescript
const accessToken = localStorage.getItem('microservice_access_token');

const response = await fetch('https://your-microservice.com/api/data', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
});
```

### 3. Refresh Access Token

```typescript
const refreshToken = localStorage.getItem('microservice_refresh_token');

const response = await fetch('/api/microservices/refresh', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ refreshToken }),
  credentials: 'include',
});

const { accessToken, expiresIn } = await response.json();
localStorage.setItem('microservice_access_token', accessToken);
```

### 4. Revoke Token (Logout)

```typescript
const refreshToken = localStorage.getItem('microservice_refresh_token');

await fetch('/api/microservices/revoke', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ refreshToken }),
  credentials: 'include',
});

// Clear tokens from storage
localStorage.removeItem('microservice_access_token');
localStorage.removeItem('microservice_refresh_token');
```

## Token Payload Structure

The access token contains the following payload:

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "organizationId": "uuid",
  "organizationSlug": "company-slug",
  "role": "owner" | "admin" | "member",
  "permissions": [
    { "resource": "organization", "action": "read" },
    { "resource": "users", "action": "create" },
    // ... more permissions
  ],
  "iat": 1234567890,
  "exp": 1234571490
}
```

## Microservice Validation Examples

### Python (Flask)

```python
import jwt
import os
from flask import request, jsonify
from functools import wraps

JWT_SECRET = os.getenv('JWT_SECRET')
JWT_ISSUER = os.getenv('JWT_ISSUER', 'saas-scaffolding')
JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', 'microservices')

def validate_token(token):
    """Validate JWT token and return payload"""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=['HS256'],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError('Token expired')
    except jwt.InvalidTokenError as e:
        raise ValueError(f'Invalid token: {str(e)}')

def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({'error': 'No authorization header'}), 401
        
        try:
            token = auth_header.split(' ')[1]  # Remove 'Bearer ' prefix
            payload = validate_token(token)
            
            # Attach user info to request
            request.user = payload
            
            return f(*args, **kwargs)
        except ValueError as e:
            return jsonify({'error': str(e)}), 401
    
    return decorated_function

# Usage
@app.route('/api/data')
@require_auth
def get_data():
    user_id = request.user['userId']
    org_id = request.user['organizationId']
    role = request.user['role']
    
    # Check permissions
    permissions = request.user['permissions']
    has_permission = any(
        p['resource'] == 'data' and p['action'] == 'read'
        for p in permissions
    )
    
    if not has_permission:
        return jsonify({'error': 'Insufficient permissions'}), 403
    
    return jsonify({'data': '...'})
```

### Python (FastAPI)

```python
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os

app = FastAPI()
security = HTTPBearer()

JWT_SECRET = os.getenv('JWT_SECRET')
JWT_ISSUER = os.getenv('JWT_ISSUER', 'saas-scaffolding')
JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', 'microservices')

def validate_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency to validate JWT token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=['HS256'],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f'Invalid token: {str(e)}')

def require_permission(resource: str, action: str):
    """Dependency factory for permission checking"""
    def check_permission(user: dict = Depends(validate_token)):
        permissions = user.get('permissions', [])
        has_permission = any(
            p['resource'] == resource and p['action'] == action
            for p in permissions
        )
        if not has_permission:
            raise HTTPException(status_code=403, detail='Insufficient permissions')
        return user
    return check_permission

# Usage
@app.get('/api/data')
async def get_data(user: dict = Depends(require_permission('data', 'read'))):
    return {
        'userId': user['userId'],
        'organizationId': user['organizationId'],
        'data': '...'
    }
```

### Go

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "strings"
    
    "github.com/golang-jwt/jwt/v5"
    "github.com/gorilla/mux"
)

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))
var jwtIssuer = os.Getenv("JWT_ISSUER")
var jwtAudience = os.Getenv("JWT_AUDIENCE")

type TokenClaims struct {
    UserID           string `json:"userId"`
    Email            string `json:"email"`
    OrganizationID   string `json:"organizationId"`
    OrganizationSlug string `json:"organizationSlug"`
    Role             string `json:"role"`
    Permissions      []struct {
        Resource string `json:"resource"`
        Action   string `json:"action"`
    } `json:"permissions"`
    jwt.RegisteredClaims
}

func validateToken(tokenString string) (*TokenClaims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        return jwtSecret, nil
    })
    
    if err != nil {
        return nil, err
    }
    
    if claims, ok := token.Claims.(*TokenClaims); ok && token.Valid {
        // Validate issuer and audience
        if claims.Issuer != jwtIssuer {
            return nil, fmt.Errorf("invalid issuer")
        }
        if !claims.Audience.Contains(jwtAudience) {
            return nil, fmt.Errorf("invalid audience")
        }
        return claims, nil
    }
    
    return nil, fmt.Errorf("invalid token")
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        authHeader := r.Header.Get("Authorization")
        if authHeader == "" {
            http.Error(w, "No authorization header", http.StatusUnauthorized)
            return
        }
        
        parts := strings.Split(authHeader, " ")
        if len(parts) != 2 || parts[0] != "Bearer" {
            http.Error(w, "Invalid authorization header", http.StatusUnauthorized)
            return
        }
        
        claims, err := validateToken(parts[1])
        if err != nil {
            http.Error(w, err.Error(), http.StatusUnauthorized)
            return
        }
        
        // Add user info to context
        ctx := context.WithValue(r.Context(), "user", claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    }
}

func hasPermission(claims *TokenClaims, resource, action string) bool {
    for _, perm := range claims.Permissions {
        if perm.Resource == resource && perm.Action == action {
            return true
        }
    }
    return false
}

// Usage
func getDataHandler(w http.ResponseWriter, r *http.Request) {
    claims := r.Context().Value("user").(*TokenClaims)
    
    if !hasPermission(claims, "data", "read") {
        http.Error(w, "Insufficient permissions", http.StatusForbidden)
        return
    }
    
    response := map[string]interface{}{
        "userId":         claims.UserID,
        "organizationId": claims.OrganizationID,
        "data":           "...",
    }
    
    json.NewEncoder(w).Encode(response)
}

func main() {
    r := mux.NewRouter()
    r.HandleFunc("/api/data", authMiddleware(getDataHandler)).Methods("GET")
    http.ListenAndServe(":8080", r)
}
```

### Node.js / Express

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'saas-scaffolding';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'microservices';

function validateToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization header' });
  }
  
  try {
    const payload = validateToken(parts[1]);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
}

function requirePermission(resource, action) {
  return (req, res, next) => {
    const permissions = req.user.permissions || [];
    const hasPermission = permissions.some(
      p => p.resource === resource && p.action === action
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

// Usage
app.get('/api/data', authMiddleware, requirePermission('data', 'read'), (req, res) => {
  res.json({
    userId: req.user.userId,
    organizationId: req.user.organizationId,
    data: '...',
  });
});
```

### Ruby (Rails)

```ruby
# config/initializers/jwt.rb
require 'jwt'

JWT_SECRET = ENV['JWT_SECRET']
JWT_ISSUER = ENV['JWT_ISSUER'] || 'saas-scaffolding'
JWT_AUDIENCE = ENV['JWT_AUDIENCE'] || 'microservices'

# app/controllers/concerns/jwt_authentication.rb
module JwtAuthentication
  extend ActiveSupport::Concern

  def validate_token(token)
    decoded_token = JWT.decode(
      token,
      JWT_SECRET,
      true,
      {
        algorithm: 'HS256',
        iss: JWT_ISSUER,
        verify_iss: true,
        aud: JWT_AUDIENCE,
        verify_aud: true
      }
    )
    decoded_token[0]
  rescue JWT::ExpiredSignature
    raise 'Token expired'
  rescue JWT::DecodeError => e
    raise "Invalid token: #{e.message}"
  end

  def authenticate_request!
    auth_header = request.headers['Authorization']
    
    unless auth_header
      render json: { error: 'No authorization header' }, status: :unauthorized
      return
    end
    
    parts = auth_header.split(' ')
    unless parts.length == 2 && parts[0] == 'Bearer'
      render json: { error: 'Invalid authorization header' }, status: :unauthorized
      return
    end
    
    begin
      @current_user = validate_token(parts[1])
    rescue => e
      render json: { error: e.message }, status: :unauthorized
      return
    end
  end

  def require_permission(resource, action)
    permissions = @current_user['permissions'] || []
    has_permission = permissions.any? do |p|
      p['resource'] == resource && p['action'] == action
    end
    
    unless has_permission
      render json: { error: 'Insufficient permissions' }, status: :forbidden
      return false
    end
    
    true
  end
end

# app/controllers/api/data_controller.rb
class Api::DataController < ApplicationController
  include JwtAuthentication
  
  before_action :authenticate_request!
  
  def show
    unless require_permission('data', 'read')
      return
    end
    
    render json: {
      userId: @current_user['userId'],
      organizationId: @current_user['organizationId'],
      data: '...'
    }
  end
end
```

## Environment Variables

Each microservice needs these environment variables:

```bash
JWT_SECRET=your-jwt-secret-key-min-32-characters-long
JWT_ISSUER=saas-scaffolding  # Optional, defaults to 'saas-scaffolding'
JWT_AUDIENCE=microservices   # Optional, defaults to 'microservices'
```

**Important**: The `JWT_SECRET` must be the same across all microservices and the Next.js frontend.

## Security Best Practices

1. **Always use HTTPS** in production
2. **Store tokens securely** - Use httpOnly cookies or secure storage
3. **Rotate secrets** - Change JWT_SECRET periodically
4. **Validate permissions** - Always check permissions in microservices, don't trust token alone
5. **Token expiration** - Access tokens expire in 1 hour, refresh regularly
6. **Revoke on logout** - Always revoke refresh tokens when user logs out
7. **Monitor token usage** - Log token validation failures for security monitoring

## API Endpoints

### POST /api/microservices/token
Obtain access and refresh tokens for current user and organization.

**Request**: Requires authenticated session (NextAuth cookie)

**Response**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "uuid-refresh-token",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

### POST /api/microservices/refresh
Refresh access token using refresh token.

**Request**:
```json
{
  "refreshToken": "uuid-refresh-token"
}
```

**Response**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

### POST /api/microservices/revoke
Revoke refresh token(s).

**Request**:
```json
{
  "refreshToken": "uuid-refresh-token"  // Optional: revoke specific token
  // OR
  "revokeAll": true  // Revoke all tokens for current user
}
```

## Troubleshooting

### Token Expired
- Access tokens expire after 1 hour
- Use refresh token to obtain new access token
- Implement automatic token refresh in your frontend

### Invalid Token
- Verify JWT_SECRET matches across all services
- Check issuer and audience match configuration
- Ensure token format is correct (Bearer <token>)

### Permission Denied
- Check permissions in token payload
- Verify user role in organization
- Ensure permission check logic matches expected format

### No Organization Context
- Ensure user is accessing from within an organization (tenant route)
- Token generation requires active organization membership

