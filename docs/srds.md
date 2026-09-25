# ZaraiLink — Software Requirements & Design Specification

- Project: ZaraiLink
- System Type: Agricultural E-Commerce Platform + AI Advisory + Private Dealer Inventory Management System
- Architecture: Modular Monolithic / Integrated Platform with Separate Inventory Subsystem
- Frontend: React Native
- Backend: FastAPI
- Database: Supabase PostgreSQL
- Storage: Supabase Storage
- Version Control: Git + GitHub
- AI: API-integrated disease advisory module
- Roles: Admin, Farmer, Buyer, Dealer, Expert

## 1. System Vision

ZaraiLink is a comprehensive agricultural e-commerce ecosystem connecting:

- Farmers
- Buyers
- Dealers
- Agricultural Experts
- Platform Administrator

The system consists of three major functional areas:

### 1. Main ZaraiLink E-Commerce Platform

This is the core platform containing:

- Marketplace
- Farmers
- Buyers
- Dealers
- Experts
- Products
- Orders
- Payments
- Delivery
- Messaging
- Notifications
- Reviews
- Expert consultations
- AI disease advisory
- Administration and moderation

Everything within the main platform is under ZaraiLink Administrator moderation.

### 2. AI Disease Advisory Module

AI Disease Advisory is an integrated module of ZaraiLink.

Farmers can scan plant diseases and receive:

- Disease prediction
- Disease information
- AI-generated advisory
- Recommended treatment/cure
- Precautions
- Recommendation to consult an expert when required

The AI system is accessed through API calls from the main ZaraiLink platform.

### 3. Dealer Inventory Management System

Inventory Management is a private Dealer-only subsystem.

It is accessed from the approved Dealer's ZaraiLink dashboard but operates as a dedicated inventory-management environment.

The Dealer controls their own inventory.

The ZaraiLink Administrator does not perform operational inventory management.

## 2. High-Level Architecture

```
                         ZARAILINK
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
       MAIN E-COMMERCE              AI ADVISORY
          PLATFORM                      API
              │                           │
     ┌────────┼────────┐                  │
     │        │        │                  ▼
     ▼        ▼        ▼             AI Disease
  Farmer    Buyer    Dealer             Report
     │        │        │                  │
     │        │        ├───────┐          │
     │        │        │       │          ▼
     │        │        │       │      Expert
     │        │        │       │   Consultation
     │        │        │       │
     │        │        ▼       │
     │        │   INVENTORY    │
     │        │   SYSTEM       │
     │        │   (PRIVATE)    │
     │        │       │        │
     │        │       ▼        │
     │        │    Dealer      │
     │        │   Controlled   │
     │        │                 │
     └────────┴─────────────────┘
                   │
                   ▼
               ADMIN
          Platform Moderation
```

## 3. User Roles

ZaraiLink has exactly five roles:

| Role | Registration | Admin Approval | Main Platform | Private Inventory |
|---|---|---|---|---|
| Admin | No public registration | N/A | Full | No |
| Farmer | Public | No* | Yes | No |
| Buyer | Public | No* | Yes | No |
| Dealer | Public + documents | Required | Yes after approval | Yes |
| Expert | Public + documents | Required | Yes after approval | No |

\* Farmer/Buyer account access can follow normal account verification requirements but does not require the specialized professional approval workflow used for Dealers and Experts.

## 4. Registration System

The public registration page contains:

```
Create Your ZaraiLink Account

[ Register as Farmer ]

[ Register as Buyer ]

[ Register as Dealer ]

[ Register as Expert ]
```

There is no public Admin registration.

## 5. Farmer Registration

Farmers provide standard account information such as:

- Full name
- Email
- Phone
- Password/authentication credentials
- Country
- Province/state
- City
- Village
- Address
- Relevant profile information

After successful registration and verification requirements, the Farmer can access the Farmer platform.

## 6. Buyer Registration

Buyers provide:

- Full name
- Email
- Phone
- Password/authentication credentials
- Country
- Province/state
- City
- Address

After successful registration and verification requirements, the Buyer can access the marketplace.

## 7. Dealer Registration & Verification

Dealer registration is a public registration process, but Dealers cannot access the Dealer platform until the application has been approved by an Administrator.

### Dealer Registration

The Dealer submits:

#### Account Information

- Full name
- Email
- Phone
- Password/authentication credentials

#### Business Information

- Business name
- Business address
- Business location
- Business type
- Business registration information

#### Required Documents

Examples include:

- Business registration certificate
- Business license
- Relevant registration documents
- Supporting business documentation

The exact required documents should be configurable.

## 8. Dealer Approval Workflow

```
Dealer Registration
        ↓
Submit Information + Documents
        ↓
Application Status:
PENDING
        ↓
Administrator Review
        ↓
   ┌────┴────┐
   ▼         ▼
APPROVE    REJECT
   │         │
   ▼         ▼
ACTIVE    REJECTION
ACCOUNT   NOTIFICATION
   │
   ▼
Approval Email
   │
   ▼
Dealer Logs In Again
   │
   ▼
Dealer Dashboard
```

The Dealer cannot access protected Dealer functionality while the application is:

```
PENDING
```

or

```
REJECTED
```

## 9. Dealer Approval Email

After Administrator approval, ZaraiLink sends an email informing the Dealer that their account has been approved.

The email should contain:

- Approval confirmation
- Account information
- Login instruction
- ZaraiLink login destination
- Relevant next steps

The Dealer then logs into ZaraiLink again to access their approved account.

## 10. Expert Registration & Verification

Experts also have public registration.

The Expert submits:

#### Personal Information

- Full name
- Email
- Phone
- Password/authentication credentials

#### Professional Information

- Professional specialization
- Years of experience
- Institution affiliation
- Professional information

#### Required Documents

Examples:

- Degree certificates
- Professional qualifications
- Experience certificates/documents
- Institution affiliation documentation
- Other relevant professional documents

## 11. Expert Approval Workflow

```
Expert Registration
        ↓
Submit Professional Information
        +
Required Documents
        ↓
PENDING
        ↓
Administrator Review
        ↓
   ┌────┴────┐
   ▼         ▼
APPROVE    REJECT
   │         │
   ▼         ▼
ACTIVE    REJECTION
ACCOUNT   NOTIFICATION
   │
   ▼
Approval Email
   │
   ▼
Expert Logs In Again
   │
   ▼
Expert Dashboard
```

An Expert cannot access protected Expert functionality until the account is approved.

## 12. Administrator Verification Dashboard

The Admin Dashboard must contain dedicated approval queues.

### Dealer Applications

```
Pending Dealers
├── Business Information
├── Submitted Documents
├── Review
├── Approve
└── Reject
```

### Expert Applications

```
Pending Experts
├── Professional Information
├── Degrees
├── Experience
├── Institution Affiliation
├── Review
├── Approve
└── Reject
```

Admin should be able to inspect submitted documentation before approval.

## 13. Account Status Model

Dealer and Expert accounts should have states such as:

```
PENDING
APPROVED / ACTIVE
REJECTED
SUSPENDED
```

Authorization must be enforced server-side.

For example:

```
Dealer + PENDING
       ↓
No Dealer Platform Access
```

```
Dealer + APPROVED
       ↓
Dealer Platform Access
       ↓
Inventory Access
```

## 14. Main Platform Moderation

The entire main ZaraiLink ecosystem remains under Administrator moderation.

Admin can manage:

- Farmers
- Buyers
- Dealers
- Experts
- Dealer applications
- Expert applications
- Products
- Marketplace listings
- Orders
- Reviews
- Reports
- Consultations
- AI activity
- Platform content
- Accounts
- Suspensions
- Audit logs

## 15. Dealer Inventory Boundary

The critical distinction remains:

The Dealer is a member of the ZaraiLink e-commerce platform, but their inventory system is a private operational system controlled by that Dealer.

Therefore:

```
ZaraiLink Admin
       │
       │ Moderates
       ▼
Dealer Marketplace Account
       │
       │ Accesses
       ▼
Private Inventory System
       │
       │ Controlled by
       ▼
Dealer
```

The Admin does not need operational access to:

- Dealer stock
- Storage operations
- Inventory adjustments
- Supplier records
- Internal stock reports

unless future requirements explicitly introduce such functionality.

## 16. Dealer Inventory Access

Only an approved Dealer receives the Inventory Management option.

Dealer Dashboard:

```
┌──────────────────────────────────┐
│ Dealer Dashboard                 │
│                                  │
│ Marketplace                     │
│ My Products                      │
│ Orders                           │
│ Messages                         │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ Inventory Management         │ │
│ │ Manage stock, storage and    │ │
│ │ inventory operations         │ │
│ │                              │ │
│ │ [Open Inventory System]      │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

## 17. Inventory System

The Inventory Management System has its own application interface.

It includes:

- Inventory Dashboard
- Products / SKUs
- Stock
- Storage Locations
- Suppliers
- Stock Movements
- Stock Adjustments
- Low Stock Alerts
- Purchase / Restock Records
- Reports
- Analytics
- Settings

## 18. Inventory Dashboard

The Dealer should see:

- Total products
- Total stock units
- Low-stock products
- Out-of-stock products
- Inventory value
- Recent stock movements
- Recent adjustments
- Recent restocks
- Inventory alerts
- Stock trends

## 19. Automatic Inventory Synchronization

This is an important new requirement.

When a Dealer sells a product through the main ZaraiLink marketplace, inventory should automatically reflect the completed marketplace transaction.

The primary synchronization trigger is:

When a ZaraiLink order is dispatched, the corresponding Dealer inventory stock is automatically reduced.

Example:

```
Dealer Inventory
Urea = 100 units
```

Customer places order:

```
Order = 20 units
```

When order reaches:

```
DISPATCHED
```

system performs:

```
Inventory
100 → 80
```

and creates a stock movement:

```
Type: STOCK_OUT
Source: ZARAILINK_ORDER
Order ID: XXXXX
Quantity: 20
```

## 20. Why Dispatch Is the Inventory Trigger

The SRDS should explicitly distinguish:

```
Order Placed
       ↓
Order Processing
       ↓
Order Confirmed
       ↓
Order Dispatched
       ↓
Inventory Stock Deducted
```

The inventory system should not blindly deduct stock merely because a customer placed an order if the business workflow has not yet reached the defined dispatch stage.

This avoids unnecessary inventory deductions from cancelled/unfulfilled orders.

## 21. Inventory Synchronization Safety

The synchronization process must be:

- Transaction-safe
- Idempotent
- Auditable

An order must not cause the same stock deduction twice.

Example:

```
Order #1001
Quantity = 10

Dispatch Event
       ↓
Inventory -10
       ↓
Movement Record Created
       ↓
Sync Completed
```

If the dispatch event is accidentally processed again:

```
Order #1001
Already synchronized
       ↓
Do NOT deduct another 10
```

## 22. Local / Offline Marketplace Sales

A Dealer may sell products outside ZaraiLink.

Examples:

- Physical shop sale
- Local customer
- Phone order
- Wholesale sale
- Other non-ZaraiLink transaction

These transactions are not automatically visible to the ZaraiLink marketplace.

Therefore the Dealer must be able to manually update inventory.

## 23. Manual Inventory Adjustment

Dealer can create:

### Stock Out

```
Product: Fertilizer
Quantity: 25
Reason: Local Sale
```

### Stock In

```
Product: Fertilizer
Quantity: 100
Reason: Supplier Restock
```

### Adjustment

```
Product: Fertilizer
Quantity: -5
Reason: Damaged Stock
```

Every manual adjustment must create an inventory movement record.

## 24. Inventory Movement Sources

The inventory system should distinguish between:

```
ZARAILINK_ORDER
LOCAL_SALE
PURCHASE
RESTOCK
MANUAL_ADJUSTMENT
DAMAGE
EXPIRY
TRANSFER
OTHER
```

This allows meaningful reporting.

## 25. Inventory Reconciliation

The Dealer should be able to compare:

```
Marketplace Sales
        +
Manual/Local Sales
        +
Adjustments
        +
Restocks
        =
Current Inventory
```

This gives the Dealer a reliable inventory history.

## 26. Buyer ↔ Seller Commerce

The marketplace must support buyers purchasing from both Farmers and Dealers.

```
Buyer
 ├── Farmer Product
 └── Dealer Product
```

A Buyer can therefore place orders from:

- Farmers
- Dealers

## 27. Farmer Purchasing From Dealer

Farmers are not restricted to selling products.

A Farmer can purchase agricultural products from Dealers.

Example:

```
Farmer
   ↓
Marketplace
   ↓
Dealer
   ↓
Fertilizer
   ↓
Purchase
```

## 28. Dealer Purchasing From Farmer

Dealers can also purchase products from Farmers.

Example:

```
Dealer
   ↓
Marketplace
   ↓
Farmer
   ↓
Agricultural Product
   ↓
Purchase
```

This creates a genuine multi-sided agricultural marketplace.

## 29. Marketplace Participant Model

The platform therefore supports:

```
BUYER ─────────→ FARMER
BUYER ─────────→ DEALER

FARMER ────────→ DEALER
FARMER ────────→ FARMER* 

DEALER ────────→ FARMER
DEALER ────────→ DEALER*
```

\* Subject to the marketplace's supported transaction rules.

The essential requirement is that Farmers and Dealers can both act as sellers and buyers where permitted by the product/listing rules.

## 30. Messaging System

The messaging system must support the following communication relationships:

```
Buyer → Dealer
Buyer ↔ Dealer
Buyer → Farmer
Buyer ↔ Farmer
Dealer → Farmer
Dealer ↔ Farmer
Farmer → Dealer
```

Already covered by the same conversation:

```
Farmer ↔ Dealer
Farmer → Expert
Farmer ↔ Expert
```

Messaging remains inside the main ZaraiLink platform.

## 31. Messaging Authorization

Users cannot arbitrarily access another user's conversations.

Conversation access must be based on legitimate relationships such as:

- Marketplace transaction
- Product inquiry
- Expert consultation
- Platform-supported communication

All conversation access must be authorized server-side.

## 32. AI Disease Advisory

The AI Disease Advisory module remains integrated into the main platform.

Farmer workflow:

```
Farmer
 ↓
Scan Disease
 ↓
Camera / Gallery
 ↓
Plant Image
 ↓
AI API
 ↓
Disease Prediction
 ↓
AI Disease Report
 ↓
AI Advisory
```

## 33. AI Disease Report

The AI result should contain information such as:

- Disease
- Confidence
- Symptoms
- Recommended Cure/Treatment
- Precautions
- General Advisory

A disclaimer should clearly communicate that the AI result is advisory and not a substitute for professional agricultural diagnosis.

## 34. AI → Expert Consultation

When the Farmer chooses:

```
Consult an Expert
```

the existing AI report must accompany the consultation request.

Workflow:

```
AI Scan
   ↓
Disease Report
   ↓
AI Advisory
   ↓
Farmer selects:
"Consult Expert"
   ↓
Consultation Request
   ↓
Expert receives:
   ├── Farmer information
   ├── Plant image
   ├── Predicted disease
   ├── Confidence
   ├── AI disease report
   ├── Recommended cure
   └── Precautions
```

## 35. Expert Consultation Interface

The Expert should see an AI-assisted case summary.

Example:

```
CONSULTATION REQUEST

Farmer:
[Name]

Plant:
[Crop]

Uploaded Image:
[Image]

AI Prediction:
Tomato Disease

Confidence:
XX%

AI Disease Report:
[Report]

Recommended Cure:
[AI recommendation]

Precautions:
[AI precautions]

Expert Response:
[Expert writes professional assessment]
```

This allows the Expert to understand what the AI identified before providing professional guidance.

## 36. Expert Override / Professional Assessment

The Expert's professional response must remain distinct from the AI prediction.

The system should clearly differentiate:

```
AI Assessment
```

from:

```
Expert Assessment
```

The Expert can:

- Agree with AI
- Correct AI
- Add additional diagnosis
- Provide professional recommendations
- Request additional information
- Continue consultation

## 37. AI Failure

If AI is unavailable:

```
AI Service Unavailable
```

the main marketplace must continue functioning.

AI failure must not affect:

- Marketplace
- Orders
- Payments
- Messaging
- Inventory
- Expert accounts

## 38. Project Directory Architecture

The project must be organized by module and responsibility, rather than placing unrelated files together.

The directory structure should make it immediately obvious which code belongs to which module.

A proposed architecture:

```
ZaraiLink/
│
├── frontend/
│   │
│   ├── admin/
│   ├── farmer/
│   ├── dealer/
│   ├── buyer/
│   ├── expert/
│   │
│   ├── ai/
│   ├── inventory/
│   │
│   ├── common/
│   │
│   ├── theme/
│   │
│   ├── navigation/
│   ├── services/
│   ├── state/
│   ├── hooks/
│   ├── utils/
│   ├── assets/
│   └── config/
│
├── backend/
│   │
│   ├── admin/
│   ├── farmer/
│   ├── dealer/
│   ├── buyer/
│   ├── expert/
│   │
│   ├── ai/
│   ├── inventory/
│   │
│   ├── common/
│   │
│   ├── auth/
│   ├── database/
│   ├── storage/
│   ├── middleware/
│   ├── config/
│   └── main.py
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── config/
│
├── tests/
│   ├── admin/
│   ├── farmer/
│   ├── dealer/
│   ├── buyer/
│   ├── expert/
│   ├── ai/
│   ├── inventory/
│   └── common/
│
├── docs/
│
├── .env.example
├── .gitignore
├── README.md
└── ...
```

## 39. Frontend Module Ownership

Every module must own its UI components.

For example:

```
frontend/
│
├── farmer/
│   ├── screens/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── types/
│
├── dealer/
│   ├── screens/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── types/
```

The same pattern applies to:

- Admin
- Buyer
- Expert
- AI
- Inventory

## 40. AI Module Ownership

Everything specifically belonging to AI should live inside:

```
ai/
```

Examples:

```
ai/
├── screens/
├── components/
├── services/
├── api/
├── types/
├── models/
├── utils/
└── config/
```

No AI-specific code should be scattered across unrelated user modules.

Farmer screens can call the AI module, but AI functionality itself should remain owned by the AI module.

## 41. Inventory Module Ownership

Everything specific to inventory belongs under:

```
inventory/
```

Example:

```
inventory/
├── dashboard/
├── products/
├── stock/
├── storage/
├── suppliers/
├── movements/
├── alerts/
├── reports/
├── analytics/
├── services/
├── api/
├── components/
├── hooks/
├── types/
└── utils/
```

Dealer screens should invoke the inventory module rather than duplicating inventory functionality.

## 42. Common System

A `common/` area should contain functionality genuinely shared across the platform.

Examples:

```
common/
├── components/
├── forms/
├── validation/
├── types/
├── constants/
├── utilities/
├── error-handling/
├── loading/
├── permissions/
├── api/
└── formatting/
```

Common code must not contain business logic belonging exclusively to a particular role.

## 43. Theme System

Theme must be centralized.

```
theme/
├── colors.ts
├── typography.ts
├── spacing.ts
├── dimensions.ts
├── shadows.ts
├── borders.ts
├── components.ts
└── index.ts
```

All modules should consume the centralized theme.

Individual modules should not randomly define their own colors, typography, spacing or visual system.

## 44. Role-Based Theme Accents

The previously established role accents remain:

```
Buyer   → #1976D2
Farmer  → #2E7D32
Dealer  → #EF6C00
Expert  → #7B1FA2
Admin   → #374151
```

Module accents:

```
Marketplace → Green
Dealer      → Orange
Orders      → Blue
Expert      → Purple
AI          → #00897B
Payments    → #43A047
Notifications → #F9A825
```

These should be centralized in the theme system rather than hard-coded throughout screens.

## 45. Supabase Architecture

Supabase is the primary infrastructure for:

### PostgreSQL

Used for:

- Users/profile-related data
- Products
- Orders
- Payments
- Reviews
- Messages
- Consultations
- AI records
- Inventory records
- Audit logs
- Other persistent application data

### Supabase Storage

Used for:

- Product images
- Farmer images
- Disease scan images
- Dealer documents
- Expert documents
- Profile images
- Other approved file assets

Storage access must use appropriate policies and authorization.

## 46. Git & GitHub

Git and GitHub are strictly development/version-control infrastructure.

They are used for:

- Source-code version control
- Branching
- Commit history
- Collaboration
- Backup/version tracking
- Pull requests
- Release management

They are not application storage infrastructure.

The application's production/persistent data belongs in Supabase.

Therefore:

```
Git/GitHub
    ↓
SOURCE CODE
```

while:

```
Supabase PostgreSQL
    ↓
APPLICATION DATA
```

and:

```
Supabase Storage
    ↓
APPLICATION FILES
```

## 47. Separation of Responsibilities

The architecture should maintain a strict separation:

```
USER MODULE
    ↓
MODULE SERVICES
    ↓
COMMON/API LAYER
    ↓
FASTAPI
    ↓
DOMAIN / APPLICATION SERVICES
    ↓
REPOSITORIES
    ↓
SUPABASE
```

Modules should not directly manipulate unrelated modules' databases or internal state.

## 48. Inventory ↔ Marketplace Integration

The two systems communicate through controlled APIs/events.

Example:

```
Main ZaraiLink
       │
       │ Order Dispatched
       ▼
Inventory Integration Service
       │
       ▼
Dealer Inventory
       │
       ▼
Stock Movement
       │
       ▼
Quantity Updated
```

Manual inventory changes happen inside the Inventory System.

```
Dealer
 ↓
Inventory System
 ↓
Manual Stock Adjustment
 ↓
Stock Movement
 ↓
Updated Inventory
```

## 49. Data Ownership

### ZaraiLink owns

- User accounts
- Marketplace
- Orders
- Marketplace listings
- Reviews
- Expert consultations
- AI records
- Platform moderation

### Dealer owns operational inventory data

- Stock
- Storage
- Internal suppliers
- Local sales
- Inventory adjustments
- Inventory reports
- Internal inventory analytics

The inventory data still uses the project's Supabase infrastructure but is logically isolated through authorization and ownership boundaries.

## 50. Security Rules

The system must enforce:

### No Admin Registration

```
Public Registration
      ↓
Farmer / Buyer / Dealer / Expert
```

Never:

```
Public → Admin
```

### Dealer Approval

```
Dealer
 ↓
PENDING
 ↓
Admin Approval
 ↓
ACTIVE
```

### Expert Approval

```
Expert
 ↓
PENDING
 ↓
Admin Approval
 ↓
ACTIVE
```

### Inventory

```
Approved Dealer
       ↓
Own Inventory Only
```

A Dealer must never access another Dealer's inventory.

## 51. Audit Logging

All important main-platform administrative actions should be logged.

Examples:

- Dealer Application Approved
- Expert Application Approved
- Dealer Application Rejected
- Expert Application Rejected
- User Suspended
- Product Moderated
- Review Moderated
- Order Administrative Action
- AI Configuration Changed

Inventory should maintain its own operational history:

- Stock Added
- Stock Removed
- Local Sale
- Marketplace Dispatch
- Stock Adjustment
- Storage Transfer

## 52. Final System Model

The final ZaraiLink architecture can be summarized as:

```
                         ┌──────────────────────┐
                         │       ADMIN          │
                         │ Platform Moderation  │
                         └──────────┬───────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────┐
│                    ZARAILINK PLATFORM                   │
│                                                         │
│  Farmer │ Buyer │ Dealer │ Expert │ Marketplace        │
│                                                         │
│  Products │ Orders │ Payments │ Messaging │ Reviews    │
│                                                         │
│  Expert Consultation │ Notifications │ Moderation       │
│                                                         │
│                 AI DISEASE ADVISORY                    │
│                         │                               │
│                         ▼                               │
│                    AI API / MODEL                       │
└─────────────────────────┬───────────────────────────────┘
                          │
                   Dealer Account
                          │
                          ▼
              ┌───────────────────────┐
              │ INVENTORY MANAGEMENT  │
              │      SYSTEM           │
              │                       │
              │ Dashboard             │
              │ Stock                 │
              │ Storage               │
              │ Suppliers             │
              │ Alerts                │
              │ Reports               │
              │ Analytics             │
              └───────────┬───────────┘
                          │
                          ▼
                       DEALER
                  Private Control
```

## 53. Final Critical Rules for the Claude Design Prompt

These should be treated as non-negotiable architectural requirements when we turn this SRDS into your Claude design prompt:

1. Exactly five roles: Admin, Farmer, Buyer, Dealer, Expert.
2. Public registration: Farmer, Buyer, Dealer and Expert.
3. No public Admin registration.
4. Dealer registration requires business documentation.
5. Expert registration requires degrees, experience and institution-affiliation documentation.
6. Dealer and Expert accounts remain PENDING until Admin approval.
7. Approved Dealer/Expert receives an approval email.
8. Dealer/Expert must log in again after approval.
9. Dealer and Expert are normal members of the main ZaraiLink ecosystem after approval.
10. All main ZaraiLink functionality is under Admin moderation.
11. Inventory Management is private to the Dealer.
12. Admin does not operationally manage Dealer inventory.
13. Inventory has its own dashboard and dedicated modern UI.
14. Marketplace orders automatically synchronize inventory when the order is dispatched.
15. Inventory synchronization must be idempotent and auditable.
16. Dealers can manually record local/non-ZaraiLink sales and stock changes.
17. Buyers can purchase from Farmers and Dealers.
18. Farmers can purchase from Dealers.
19. Dealers can purchase from Farmers.
20. Messaging must support Buyer↔Dealer, Buyer↔Farmer, Dealer↔Farmer and Farmer↔Expert.
21. AI Disease Advisory is an integrated API-driven module, not a separate marketplace.
22. Farmers can access AI through Scan Disease.
23. AI reports include disease result, advisory, recommended cure/treatment and precautions.
24. When an AI case is referred to an Expert, the complete AI report accompanies the consultation request.
25. Expert assessment must remain distinguishable from AI assessment.
26. The project directory must be modular by role and responsibility.
27. Separate top-level modules must exist for Admin, Farmer, Dealer, Buyer, Expert, AI and Inventory.
28. Shared functionality belongs in common.
29. Visual design tokens belong in theme.
30. Supabase PostgreSQL is the application's database.
31. Supabase Storage is the application's file/object storage.
32. Git/GitHub is only for source-code version control, not application data storage.
33. Module-specific code must remain inside its respective module.
34. Cross-module communication must occur through defined services/APIs rather than uncontrolled imports or direct database manipulation.
35. No escrow or held-funds/release workflow.
36. Delivery remains an explicit order charge.
37. ZaraiLink does not own riders, vehicles, warehouses or logistics infrastructure.
38. AI failure must not take down the e-commerce platform.
39. Inventory failure must not take down the main marketplace.
40. Authorization must be enforced server-side, not merely hidden in the UI.

This SRDS should now be the baseline document before we write the final Claude prompt for the complete UI/UX and project restructuring.
