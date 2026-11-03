# Atomgrid ERP — Division, Department & Workflow Architecture

**Status:** Proposed implementation baseline  |  **Scope:** Atomgrid internal ERP
**Decisions:** B2B/B2C divisions; B2B sequential stages; central SCM oversight plus departmental execution ownership.

## 1. Architecture decisions

1. One company-wide application and transactional database.
2. B2B and B2C are business divisions with separate workspaces, workflows, queues, KPIs and permissions.
3. Product, customer, supplier, transporter, warehouse and finance masters are shared where appropriate; do not duplicate master records by division.
4. Every division-owned transaction carries a Division ID. Shared master records do not.
5. B2B primary fulfilment is sequential: Demand → Supply → Logistics.
6. R&D, Pilots, QC Sampling, Licensing and Certificates are conditional workstreams or clearance gates, not mandatory steps for every order.
7. Each B2B order has one accountable central SCM owner. Each department owns completion of its assigned stage/tasks.
8. Authorization and data scope are enforced server-side; hiding navigation is not authorization.

## 2. Organization and navigation

### Company-wide services
- Management overview; shared masters; inventory and warehouse; finance; document repository; user/role administration; audit and reporting.

### B2B departments
1. Demand
2. Supply
3. Logistics
4. R&D
5. Pilots
6. QC Sampling
7. Licensing
8. Certificates

### B2C workspaces — proposed baseline
1. Order Management
2. Payment Management
3. Demand and Allocation
4. Supply and Replenishment
5. Warehouse Fulfilment
6. Logistics and Delivery
7. Returns
8. Customer / Dealer Management

B2C workflows must be validated against Atomgrid's actual operating policies before detailed implementation.

## 3. B2B sequential workflow and ownership

| Stage | Department owner | Completion criteria |
|---|---|---|
| Demand | Demand | Customer PO/order captured; customer and product validated; quantities, delivery requirements and payment terms recorded; payment/credit rule checked |
| Supply | Supply | Source identified; stock or supplier allocation recorded; supplier readiness and expected material date confirmed; shortages escalated |
| Logistics | Logistics | Dispatch plan approved; transporter/vehicle recorded; required documents checked; dispatch and delivery evidence captured |
| Closure | Central SCM with relevant departments | POD, documentation, delivered quantity and financial hand-offs reconciled; closure criteria met |

Each handover creates a timestamped stage event and assigns the next department task. A completed stage is read-only except through a controlled reopen/correction action with reason and audit history.

### Conditional workstreams and gates

| Department | Trigger | Output |
|---|---|---|
| R&D | New product, formulation change or technical feasibility request | Technical assessment, approved specification, development decision |
| Pilots | Customer or field trial required | Pilot plan, material issue, trial report, feedback and outcome |
| QC Sampling | New batch, customer sample, periodic or exception-based check | Sample identity, test results, disposition and COA where applicable |
| Licensing | Product, manufacturer, supplier, state or transaction requires a license | Applicability, verified license, validity and expiry status |
| Certificates | Customer, product or shipment documentation requirement | Approved document linked to product, batch, supplier, order or shipment |

Only explicitly mandatory gates block the relevant transition. Informational or not-applicable gates do not block fulfilment. Gate requirements are configured by product/customer/order policy.

### Dual ownership
- One central SCM owner is accountable for end-to-end B2B order visibility, ageing, escalation and closure.
- Each stage has a department owner and assigned users.
- Conditional workstreams have their own owner and due date.
- A department cannot silently transfer or close another department's task.
- SCM can view all B2B stages, coordinate, escalate and request reopening; departmental approvals remain with authorized approvers.
- Managers see queues, overdue tasks, blockers and handover history.

### Proposed order lifecycle

Draft → Demand in progress → Supply pending/in progress → Logistics pending/in progress → Dispatched → Delivered pending closure → Closed.

On Hold and Cancelled are controlled exception states. The overall status is derived from stage instances and required gates, not edited as free text. Exact enum values and transition rules will be finalized in implementation.

## 4. B2C workflow baseline

1. Dealer/customer order received and validated.
2. Payment/credit policy checked; advance payment recorded where required.
3. Demand and stock availability checked.
4. Stock reserved or replenishment initiated.
5. Warehouse picks, packs and dispatches.
6. Delivery confirmation captured.
7. Returns, credit/refund and customer support handled where applicable.

B2C uses the same Product and Inventory masters as B2B, while preserving division-specific pricing, payment rules, fulfilment and reporting.

## 5. Target database entities

Use normalized relational entities. Do not encode departments as columns or duplicate masters.

### Organization and access
- Division: code (B2B/B2C), name, active flag.
- Department: division relation, code, name, active flag.
- UserDepartment: user, department, membership role and effective dates.
- WorkflowDefinition: division, workflow key, version and active flag.
- WorkflowStageDefinition: workflow, stage key, sequence, department and transition rules.
- Role / existing AccessRole: role definition and permissions.
- RolePermission: role, resource/module, action and scope.
- UserRoleAssignment: user, role and optional division/department/branch scope.

### Commercial records
- CustomerOrder: division, customer, external PO reference, order date, requested delivery, payment terms, owner and state.
- CustomerOrderLine: order, product, quantity, UOM, price and delivery details.
- DemandRecord: order/line, required quantity, priority, due date and status.
- SupplyPlan: order/line, fulfilment mode, source, allocated quantity, shortage and expected readiness.
- Reuse PurchaseOrder and PurchaseOrderLine, linked to demand/supply plan where relevant.
- Existing SalesOrder may be reused or migrated as the canonical commercial order after dependency analysis. Do not create two competing order masters.

### Workflow execution and accountability
- WorkflowInstance: source entity, division and workflow version.
- WorkflowStageInstance: stage, sequence, status, owner department, assigned user and lifecycle timestamps.
- Task: source record, department, assignee, due date, priority and status.
- Approval: source record, approval type, requester, approver, decision, reason and timestamps.
- Exception: source record, category, severity, owner, due date, resolution and status.
- StageEvent: from/to state, actor, timestamp, reason and metadata.
- Extend the existing Activity audit mechanism consistently.

### Technical, quality and compliance
- RAndDRequest, RAndDTrial, ProductSpecification, SpecificationRevision.
- Pilot, PilotLocation, PilotMaterial, PilotResult, PilotFeedback.
- SampleRequest, Sample, QCTest, QCTestResult, QCDisposition.
- License, LicenseApplicability, LicenseVerification, LicenseRenewal.
- CertificateType, Certificate, CertificateVersion, CertificateLink.
- Document: metadata, storage key, document type, version, uploader, checksum and linked entity.
- Link technical/QC/compliance records to relevant product, batch, supplier, customer, order or shipment using explicit relations or a controlled document-link model.

### Shared inventory, logistics and finance
- Reuse Product, Warehouse, StockLevel, StockMovement, BatchInward, BatchOutward and existing GRN/QC/outbound models where semantics fit.
- Add division-aware reservations/allocations as explicit records; do not duplicate physical stock by division.
- Physical stock remains warehouse/product/batch-based. Available-to-promise accounts for reservations, allocations, QC hold, blocked stock and policy.
- All stock changes continue through the stock service and immutable movement ledger.
- Reuse and link MisJob, DispatchQuote, Trip, ShippingDocument, EWayBill, Invoice and payment-related models after field-by-field mapping.
- Link canonical order lines to shipment/dispatch lines and invoices/payments to source documents. Add division attribution for reporting and cost/revenue allocation.

## 6. Existing repository mapping and migration cautions

The repository already has User.opsTeam (DEMAND, SUPPLY, LOGISTICS, SCM), FreshPo, MisJob, Product, Contact, stock ledger, batch inventory, SalesOrder, PurchaseOrder, inbound/outbound, trips, invoices and E-way Bills.

Migration sequence:
1. Introduce Division and Department relational master tables.
2. Seed B2B and B2C and the agreed B2B departments.
3. Backfill existing operational users and Fresh PO/MIS records to B2B and the relevant department.
4. Keep opsTeam temporarily as a compatibility field; migrate all readers/writers before deprecating it.
5. Decide whether FreshPo is the intake/board record and SalesOrder the canonical commercial order, or whether explicit migration is required. Prevent independent records from drifting.
6. Link MisJob to canonical order/order line and shipment records with stable identifiers.
7. Reconcile BatchInward/BatchOutward against the stock ledger before treating them as authoritative physical inventory.
8. Preserve old IDs, audit history and import provenance.

Do not replace these models in one large migration. First create a current-to-target field and code-path mapping.

## 7. Permission model

Permissions combine resource/module, action, scope and ownership:
- Resources: dashboard, orders, demand, supply, logistics, R&D, pilots, QC, licensing, certificates, inventory, warehouse, finance and settings.
- Actions: view, create, edit, submit, approve, reject, assign, reopen, export and administer.
- Scope: company, division, department, branch and assigned records.
- Ownership: assigned user, department or all authorized records.

| Role template | Default access |
|---|---|
| System Administrator | Company-wide configuration and access administration |
| Management | Company-wide read, dashboards and configured approvals |
| SCM Owner | Cross-department B2B visibility, order ownership, escalation and closure |
| Demand | B2B Demand records and stage actions |
| Supply | B2B Supply and supplier-readiness actions |
| Logistics | B2B dispatch, transporter, shipment and POD actions |
| R&D | R&D requests, trials and specifications |
| Pilots | Pilot plans, execution and outcomes |
| QC | Sample requests, test results and QC disposition |
| Licensing | License applicability, verification and renewals |
| Certificates | Certificate repository, issuance and validity |
| B2C Operations | B2C orders and fulfilment stages |
| Warehouse | Authorized GRN, QC, batch, picking, packing and stock actions |
| Finance | Invoices, receipts, payables, receivables and reconciliation |
| Auditor / Read-only | Read-only access to explicitly authorized scopes |

Rules:
- Department users edit their own department's records and assigned tasks, not another department's completed stage.
- SCM sees all B2B stages and manages oversight; departmental approvals remain with authorized approvers.
- QC disposition, compliance verification, payment clearance and financial posting require explicit permissions and audit events.
- Division and branch filters apply in server-side queries and server actions.
- Default deny for unassigned modules/actions.
- Exports and document downloads enforce the same scope as page views.

## 8. Dashboards and reporting

### Management overview
- Open orders by division and stage; order ageing and overdue handovers; holds and blockers.
- Supply readiness and stock shortages; dispatch, delivery and POD performance.
- QC pending/rejected samples; pilot outcomes and R&D pipeline.
- Licenses/certificates nearing expiry; division-wise revenue, costs and outstanding balances.

### B2B overview
- Demand queue; supply pending and supplier-not-ready; logistics pending and dispatch due.
- Conditional gates pending by department; SCM-owned orders and ageing; department SLA and handover performance.

### Department dashboards
Pending, in-progress, overdue, blocked and completed queues, with filters for date, customer, product, order, owner and priority.

## 9. Implementation plan

### Phase 0 — Audit and baseline
- Run build, typecheck, lint and tests.
- Inventory existing pages, actions, models and integrations.
- Map Fresh PO, MIS, SalesOrder, Batch Inventory and stock ledger.
- Identify security gaps and duplicate sources of truth.
- Produce current-to-target entity mapping.

### Phase 1 — Organization and authorization
- Add Division and Department tables; seed B2B/B2C.
- Add department membership and scoped role assignment.
- Extend permission helpers and role editor.
- Add server-side division/department scope helpers.
- Test cross-division and cross-branch access.

### Phase 2 — B2B workflow engine
- Define versioned sequential Demand → Supply → Logistics workflow.
- Implement central SCM owner and departmental stage owners.
- Implement handover, assignment, SLA, escalation, hold, reopen and audit events.
- Link Fresh PO / SalesOrder / MIS without duplicate source records.
- Add B2B overview and department queues.

### Phase 3 — B2B specialist workstreams
- R&D and specification revisions.
- Pilots and outcome tracking.
- QC sampling and disposition.
- Licensing applicability and renewal tracking.
- Certificate/document repository and expiry controls.
- Configurable mandatory gates.

### Phase 4 — B2C workflow
- Validate B2C policy and dealer order intake.
- Implement payment/credit checks.
- Implement allocation, fulfilment, delivery, returns and support.
- Use shared masters and stock services.

### Phase 5 — Shared services and reconciliation
- Batch-level stock reconciliation and division-aware allocation.
- Shared warehouse and logistics integration.
- Finance source-document linking and division attribution.
- Document controls and exception management.

### Phase 6 — Reporting, integrations and rollout
- Management and department dashboards.
- SLA and operational MIS.
- Approved external integrations.
- Pilot rollout, user training and production cutover.

## 10. Engineering and release standards

- Do not rewrite the application or replace working modules without evidence.
- Do not deploy unreviewed schema changes directly to production.
- Every schema change requires a migration and migration test.
- Every server action/page enforces authorization and scope.
- Every stock change uses the stock service within a transaction.
- Every workflow transition is validated server-side and idempotent.
- Store money as Decimal; do not use floating-point arithmetic for financial calculations.
- Store document metadata and files securely; do not expose private bucket credentials or unrestricted file URLs.
- Test role access, division/branch isolation, stage transitions, duplicate submissions and stock invariants.
- Keep production data separate from demo/seed data.

## 11. First milestone definition of done

1. Repository audit and automated checks documented.
2. Target entity relationship diagram and current-to-target mapping reviewed.
3. Division/department schema and permission design reviewed.
4. B2B sequential handover and dual-ownership rules approved.
5. Existing Fresh PO, MIS and stock records have a safe migration plan.
6. Phase 1 changes delivered behind a reviewed pull request with tests.

**This document defines the target architecture; it does not mean these new entities, workflows or permissions are already implemented. Database migrations and code changes follow the audit and are reviewed incrementally.**