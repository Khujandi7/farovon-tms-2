// FAROVON TMS 2.0 — типы БД. База: Production после Phase 1.5 M8 + локально применённые миграции Phase 3A (M10–M13).
// ВНИМАНИЕ: M10–M13 НЕ применены в Production (ждут отдельного подтверждения). После их применения перегенерировать из Supabase.
// Сгенерировано @supabase/postgres-meta по локальной БД (scripts/gen-types-local.mjs); структура Phase 1–2.2 совпадает с Production.
// НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agreement_repayments: {
        Row: {
          agreement_id: string
          amount: number
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          paid_on: string
          void_reason: string | null
          voided_at: string | null
        }
        ComputedFields: never
        Insert: {
          agreement_id: string
          amount: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          paid_on: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          agreement_id?: string
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          paid_on?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_repayments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "learning_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_repayments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string | null
        }
        ComputedFields: never
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          at: string
          id: number
          new_row: Json | null
          old_row: Json | null
          reason: string | null
          row_id: string | null
          table_name: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          action: string
          at?: string
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          reason?: string | null
          row_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          reason?: string | null
          row_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      budget_line_items: {
        Row: {
          amount_usd: number
          budget_line_id: number
          category_id: number
          id: number
        }
        ComputedFields: never
        Insert: {
          amount_usd: number
          budget_line_id: number
          category_id: number
          id?: never
        }
        Update: {
          amount_usd?: number
          budget_line_id?: number
          category_id?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "budget_line_items_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          amount_usd: number
          comment: string | null
          department_id: number | null
          format: Database["public"]["Enums"]["training_format"] | null
          id: number
          kind: Database["public"]["Enums"]["training_kind"] | null
          participants_plan: number | null
          period_raw: string | null
          quarter: number | null
          request_id: string | null
          requester_raw: string | null
          status: string | null
          topic: string
          unit_id: number | null
          version_id: number
        }
        ComputedFields: never
        Insert: {
          amount_usd: number
          comment?: string | null
          department_id?: number | null
          format?: Database["public"]["Enums"]["training_format"] | null
          id?: never
          kind?: Database["public"]["Enums"]["training_kind"] | null
          participants_plan?: number | null
          period_raw?: string | null
          quarter?: number | null
          request_id?: string | null
          requester_raw?: string | null
          status?: string | null
          topic: string
          unit_id?: number | null
          version_id: number
        }
        Update: {
          amount_usd?: number
          comment?: string | null
          department_id?: number | null
          format?: Database["public"]["Enums"]["training_format"] | null
          id?: never
          kind?: Database["public"]["Enums"]["training_kind"] | null
          participants_plan?: number | null
          period_raw?: string | null
          quarter?: number | null
          request_id?: string | null
          requester_raw?: string | null
          status?: string | null
          topic?: string
          unit_id?: number | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "training_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "budget_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          fiscal_year: number
          id: number
          name: string
          note: string | null
          revision_no: number
          revision_reason: string | null
          source_sheet: string | null
          status: Database["public"]["Enums"]["budget_status"]
          supersedes_version_id: number | null
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          fiscal_year: number
          id?: never
          name: string
          note?: string | null
          revision_no?: number
          revision_reason?: string | null
          source_sheet?: string | null
          status?: Database["public"]["Enums"]["budget_status"]
          supersedes_version_id?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          fiscal_year?: number
          id?: never
          name?: string
          note?: string | null
          revision_no?: number
          revision_reason?: string | null
          source_sheet?: string | null
          status?: Database["public"]["Enums"]["budget_status"]
          supersedes_version_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_versions_supersedes_version_id_fkey"
            columns: ["supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "budget_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          archived_at: string | null
          cert_type: string
          certificate_number: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          employee_id: string
          exam_id: string | null
          expiration_date: string | null
          id: string
          issue_date: string | null
          issuing_organization: string | null
          name: string
          notes: string | null
          provider_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          skill_id: number | null
          training_id: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          cert_type?: string
          certificate_number?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          employee_id: string
          exam_id?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_organization?: string | null
          name: string
          notes?: string | null
          provider_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          skill_id?: number | null
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          cert_type?: string
          certificate_number?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          employee_id?: string
          exam_id?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_organization?: string | null
          name?: string
          notes?: string | null
          provider_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          skill_id?: number | null
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_exam_fk"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "learning_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "certificates_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      development_goals: {
        Row: {
          certificate_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          employee_id: string
          exam_id: string | null
          goal_type: string
          id: string
          note: string | null
          plan_year: number
          skill_id: number | null
          status: string
          title: string
          training_id: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          certificate_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          employee_id: string
          exam_id?: string | null
          goal_type?: string
          id?: string
          note?: string | null
          plan_year: number
          skill_id?: number | null
          status?: string
          title: string
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certificate_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          employee_id?: string
          exam_id?: string | null
          goal_type?: string
          id?: string
          note?: string | null
          plan_year?: number
          skill_id?: number | null
          status?: string
          title?: string
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "development_goals_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "v_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "development_goals_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_goals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          agreement_id: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          certificate_id: string | null
          doc_type: string
          employee_id: string | null
          exam_id: string | null
          expires_on: string | null
          file_name: string
          id: string
          mime_type: string
          note: string | null
          request_id: string | null
          size_bytes: number
          status: string
          storage_path: string
          title: string
          training_id: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        ComputedFields: never
        Insert: {
          agreement_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          certificate_id?: string | null
          doc_type: string
          employee_id?: string | null
          exam_id?: string | null
          expires_on?: string | null
          file_name: string
          id?: string
          mime_type: string
          note?: string | null
          request_id?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          title: string
          training_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          agreement_id?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          certificate_id?: string | null
          doc_type?: string
          employee_id?: string | null
          exam_id?: string | null
          expires_on?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          note?: string | null
          request_id?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          title?: string
          training_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_agreement_fk"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "learning_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_certificate_fk"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_certificate_fk"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "v_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_exam_fk"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "training_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "documents_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dq_issues: {
        Row: {
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_table: string | null
          fingerprint: string | null
          id: number
          message: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_code: string
          severity: Database["public"]["Enums"]["dq_severity"]
          source: string
          status: string
          suggestion: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_table?: string | null
          fingerprint?: string | null
          id?: never
          message: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code: string
          severity: Database["public"]["Enums"]["dq_severity"]
          source?: string
          status?: string
          suggestion?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_table?: string | null
          fingerprint?: string | null
          id?: never
          message?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code?: string
          severity?: Database["public"]["Enums"]["dq_severity"]
          source?: string
          status?: string
          suggestion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dq_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_aliases: {
        Row: {
          alias_norm: string
          confidence: number | null
          confirmed_by: string | null
          employee_id: string
          id: number
        }
        ComputedFields: never
        Insert: {
          alias_norm: string
          confidence?: number | null
          confirmed_by?: string | null
          employee_id: string
          id?: never
        }
        Update: {
          alias_norm?: string
          confidence?: number | null
          confirmed_by?: string | null
          employee_id?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "employee_aliases_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_aliases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contacts: {
        Row: {
          email: string | null
          employee_id: string
          phone: string | null
        }
        ComputedFields: never
        Insert: {
          email?: string | null
          employee_id: string
          phone?: string | null
        }
        Update: {
          email?: string | null
          employee_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_contacts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_skills: {
        Row: {
          achieved_on: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          level: string
          note: string | null
          skill_id: number
          source: string
          source_ref: string | null
        }
        ComputedFields: never
        Insert: {
          achieved_on?: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          level: string
          note?: string | null
          skill_id: number
          source?: string
          source_ref?: string | null
        }
        Update: {
          achieved_on?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          level?: string
          note?: string | null
          skill_id?: number
          source?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_skills_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          canonical_id: string
          created_at: string
          department_id: number | null
          employee_code: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          name_norm: string
          position: string | null
          termination_date: string | null
          unit_id: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          canonical_id: string
          created_at?: string
          department_id?: number | null
          employee_code?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name_norm: string
          position?: string | null
          termination_date?: string | null
          unit_id?: number | null
          updated_at?: string
        }
        Update: {
          canonical_id?: string
          created_at?: string
          department_id?: number | null
          employee_code?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name_norm?: string
          position?: string | null
          termination_date?: string | null
          unit_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_costs: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          exam_id: string
          fee: number
          fee_date: string
          fee_tjs: number | null
          funding_source: string
          fx_date: string | null
          fx_rate: number | null
          id: string
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"]
          exam_id: string
          fee: number
          fee_date?: string
          fee_tjs?: number | null
          funding_source?: string
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          exam_id?: string
          fee?: number
          fee_date?: string
          fee_tjs?: number | null
          funding_source?: string
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_costs_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: true
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_costs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          archived_at: string | null
          attempt_no: number
          canonical_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          exam_date: string
          id: string
          provider_id: string | null
          result: string
          result_note: string | null
          score: number | null
          skill_id: number
          status: string
          training_id: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          attempt_no: number
          canonical_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          exam_date: string
          id?: string
          provider_id?: string | null
          result?: string
          result_note?: string | null
          score?: number | null
          skill_id: number
          status?: string
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          attempt_no?: number
          canonical_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          exam_date?: string
          id?: string
          provider_id?: string | null
          result?: string
          result_note?: string | null
          score?: number | null
          skill_id?: number
          status?: string
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "learning_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "exams_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          code: string
          group_code: string
          id: number
          is_trainer_fee: boolean
          name: string
        }
        ComputedFields: never
        Insert: {
          code: string
          group_code: string
          id?: never
          is_trainer_fee?: boolean
          name: string
        }
        Update: {
          code?: string
          group_code?: string
          id?: never
          is_trainer_fee?: boolean
          name?: string
        }
        Relationships: []
      }
      expense_operations: {
        Row: {
          amount: number
          amount_tjs: number | null
          category_id: number
          comment: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          fx_date: string | null
          fx_rate: number | null
          id: string
          operation_date: string
          training_id: string
          void_reason: string | null
          voided_at: string | null
        }
        ComputedFields: never
        Insert: {
          amount: number
          amount_tjs?: number | null
          category_id: number
          comment?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          operation_date: string
          training_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          amount_tjs?: number | null
          category_id?: number
          comment?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          operation_date?: string
          training_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_operations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_operations_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_operations_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "expense_operations_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_answers: {
        Row: {
          block: Database["public"]["Enums"]["feedback_block"]
          question_no: number
          response_id: string
          score: number
        }
        ComputedFields: never
        Insert: {
          block: Database["public"]["Enums"]["feedback_block"]
          question_no: number
          response_id: string
          score: number
        }
        Update: {
          block?: Database["public"]["Enums"]["feedback_block"]
          question_no?: number
          response_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "feedback_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_invitations: {
        Row: {
          answered_at: string | null
          employee_id: string
          id: string
          invited_at: string
          invited_by: string | null
          participant_id: string
          status: string
          training_id: string
        }
        ComputedFields: never
        Insert: {
          answered_at?: string | null
          employee_id: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          participant_id: string
          status?: string
          training_id: string
        }
        Update: {
          answered_at?: string | null
          employee_id?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          participant_id?: string
          status?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_invitations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "training_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_invitations_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_invitations_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "feedback_invitations_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_respondents: {
        Row: {
          dedupe_key: string
          employee_id: string | null
          match_confidence: number | null
          match_status: string
          respondent_raw: string
          response_id: string
        }
        ComputedFields: never
        Insert: {
          dedupe_key: string
          employee_id?: string | null
          match_confidence?: number | null
          match_status?: string
          respondent_raw: string
          response_id: string
        }
        Update: {
          dedupe_key?: string
          employee_id?: string | null
          match_confidence?: number | null
          match_status?: string
          respondent_raw?: string
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_respondents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_respondents_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: true
            referencedRelation: "feedback_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_responses: {
        Row: {
          comment: string | null
          feedback_training_id: string | null
          id: string
          is_archive: boolean
          submitted_at: string
        }
        ComputedFields: never
        Insert: {
          comment?: string | null
          feedback_training_id?: string | null
          id?: string
          is_archive?: boolean
          submitted_at: string
        }
        Update: {
          comment?: string | null
          feedback_training_id?: string | null
          id?: string
          is_archive?: boolean
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_feedback_training_id_fkey"
            columns: ["feedback_training_id"]
            isOneToOne: false
            referencedRelation: "feedback_trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_trainings: {
        Row: {
          code: string
          event_date: string | null
          id: string
          title: string
          trainer_raw: string | null
          training_id: string | null
        }
        ComputedFields: never
        Insert: {
          code: string
          event_date?: string | null
          id?: string
          title: string
          trainer_raw?: string | null
          training_id?: string | null
        }
        Update: {
          code?: string
          event_date?: string | null
          id?: string
          title?: string
          trainer_raw?: string | null
          training_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_trainings_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_trainings_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "feedback_trainings_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_policies: {
        Row: {
          basis: string | null
          company_coverage_percent: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          document_id: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          scope: string
        }
        ComputedFields: never
        Insert: {
          basis?: string | null
          company_coverage_percent: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          document_id?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          scope?: string
        }
        Update: {
          basis?: string | null
          company_coverage_percent?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          document_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_policies_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_policies_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_policy_outcomes: {
        Row: {
          employee_responsibility_percent: number
          outcome: string
          policy_id: string
        }
        ComputedFields: never
        Insert: {
          employee_responsibility_percent: number
          outcome: string
          policy_id: string
        }
        Update: {
          employee_responsibility_percent?: number
          outcome?: string
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_policy_outcomes_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "funding_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          rate_date: string
          rate_to_tjs: number
          source: string | null
        }
        ComputedFields: never
        Insert: {
          currency: Database["public"]["Enums"]["currency_code"]
          rate_date: string
          rate_to_tjs: number
          source?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          rate_date?: string
          rate_to_tjs?: number
          source?: string | null
        }
        Relationships: []
      }
      import_job_rows: {
        Row: {
          applied_id: string | null
          apply_action: string | null
          apply_error: string | null
          candidates: Json | null
          data: NonNullable<Json>
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_match: string | null
          dup_key: string | null
          id: number
          job_id: string
          match_id: string | null
          messages: string[]
          processed_at: string | null
          raw: NonNullable<Json>
          review_code: string | null
          row_no: number
          status: string
        }
        ComputedFields: never
        Insert: {
          applied_id?: string | null
          apply_action?: string | null
          apply_error?: string | null
          candidates?: Json | null
          data?: NonNullable<Json>
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_match?: string | null
          dup_key?: string | null
          id?: never
          job_id: string
          match_id?: string | null
          messages?: string[]
          processed_at?: string | null
          raw: NonNullable<Json>
          review_code?: string | null
          row_no: number
          status: string
        }
        Update: {
          applied_id?: string | null
          apply_action?: string | null
          apply_error?: string | null
          candidates?: Json | null
          data?: NonNullable<Json>
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_match?: string | null
          dup_key?: string | null
          id?: never
          job_id?: string
          match_id?: string | null
          messages?: string[]
          processed_at?: string | null
          raw?: NonNullable<Json>
          review_code?: string | null
          row_no?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          apply_errors: number
          committed_at: string | null
          committed_by: string | null
          conflicts: number
          created_at: string
          created_by: string | null
          duplicate_rows: number
          entity: string
          error_rows: number
          file_hash: string | null
          file_name: string
          id: string
          inserted: number
          mapping: NonNullable<Json>
          new_rows: number
          note: string | null
          options: NonNullable<Json>
          review_rows: number
          skipped: number
          source: string
          status: string
          total_rows: number
          unchanged_rows: number
          updated: number
          updated_rows: number
        }
        ComputedFields: never
        Insert: {
          apply_errors?: number
          committed_at?: string | null
          committed_by?: string | null
          conflicts?: number
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          entity: string
          error_rows?: number
          file_hash?: string | null
          file_name: string
          id?: string
          inserted?: number
          mapping?: NonNullable<Json>
          new_rows?: number
          note?: string | null
          options?: NonNullable<Json>
          review_rows?: number
          skipped?: number
          source: string
          status?: string
          total_rows?: number
          unchanged_rows?: number
          updated?: number
          updated_rows?: number
        }
        Update: {
          apply_errors?: number
          committed_at?: string | null
          committed_by?: string | null
          conflicts?: number
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          entity?: string
          error_rows?: number
          file_hash?: string | null
          file_name?: string
          id?: string
          inserted?: number
          mapping?: NonNullable<Json>
          new_rows?: number
          note?: string | null
          options?: NonNullable<Json>
          review_rows?: number
          skipped?: number
          source?: string
          status?: string
          total_rows?: number
          unchanged_rows?: number
          updated?: number
          updated_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_committed_by_fkey"
            columns: ["committed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_source_members: {
        Row: {
          employee_id: string
          first_seen_at: string
          last_seen_at: string
          last_seen_job: string | null
          missing_since: string | null
          source_id: string
        }
        ComputedFields: never
        Insert: {
          employee_id: string
          first_seen_at?: string
          last_seen_at?: string
          last_seen_job?: string | null
          missing_since?: string | null
          source_id: string
        }
        Update: {
          employee_id?: string
          first_seen_at?: string
          last_seen_at?: string
          last_seen_job?: string | null
          missing_since?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_source_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_source_members_last_seen_job_fkey"
            columns: ["last_seen_job"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_source_members_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "import_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sources: {
        Row: {
          created_at: string
          created_by: string | null
          entity: string
          header_row: number | null
          id: string
          is_active: boolean
          kind: string
          last_error: string | null
          last_job_id: string | null
          last_stats: NonNullable<Json>
          last_status: string
          last_sync_at: string | null
          mapping: NonNullable<Json>
          name: string
          sheet_name: string
          spreadsheet_id: string
          spreadsheet_url: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          entity?: string
          header_row?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          last_error?: string | null
          last_job_id?: string | null
          last_stats?: NonNullable<Json>
          last_status?: string
          last_sync_at?: string | null
          mapping?: NonNullable<Json>
          name: string
          sheet_name: string
          spreadsheet_id: string
          spreadsheet_url: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity?: string
          header_row?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          last_error?: string | null
          last_job_id?: string | null
          last_stats?: NonNullable<Json>
          last_status?: string
          last_sync_at?: string | null
          mapping?: NonNullable<Json>
          name?: string
          sheet_name?: string
          spreadsheet_id?: string
          spreadsheet_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_sources_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_sources_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_agreements: {
        Row: {
          canonical_id: string
          company_coverage_percent: number
          company_funded_amount: number
          conditions: string | null
          contract_date: string | null
          contract_document_id: string | null
          contract_number: string | null
          cost_date: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          effective_from: string | null
          effective_to: string | null
          employee_id: string
          employee_responsibility_percent: number | null
          evaluated_at: string | null
          evaluated_by: string | null
          exam_id: string | null
          fail_condition: string | null
          fx_date: string | null
          fx_rate: number | null
          id: string
          note: string | null
          outcome: string | null
          pass_condition: string | null
          policy_id: string | null
          repayment_amount: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_cost: number
          total_cost_tjs: number | null
          training_id: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          canonical_id: string
          company_coverage_percent: number
          company_funded_amount?: number
          conditions?: string | null
          contract_date?: string | null
          contract_document_id?: string | null
          contract_number?: string | null
          cost_date?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_from?: string | null
          effective_to?: string | null
          employee_id: string
          employee_responsibility_percent?: number | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          exam_id?: string | null
          fail_condition?: string | null
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          note?: string | null
          outcome?: string | null
          pass_condition?: string | null
          policy_id?: string | null
          repayment_amount?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_cost: number
          total_cost_tjs?: number | null
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canonical_id?: string
          company_coverage_percent?: number
          company_funded_amount?: number
          conditions?: string | null
          contract_date?: string | null
          contract_document_id?: string | null
          contract_number?: string | null
          cost_date?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_from?: string | null
          effective_to?: string | null
          employee_id?: string
          employee_responsibility_percent?: number | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          exam_id?: string | null
          fail_condition?: string | null
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          note?: string | null
          outcome?: string | null
          pass_condition?: string | null
          policy_id?: string | null
          repayment_amount?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_cost?: number
          total_cost_tjs?: number | null
          training_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_agreements_contract_document_id_fkey"
            columns: ["contract_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_evaluated_by_fkey"
            columns: ["evaluated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "funding_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "learning_agreements_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_agreements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_event_types: {
        Row: {
          code: string
          created_at: string
          id: number
          is_active: boolean
          is_group: boolean
          is_system: boolean
          name: string
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          code: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_group?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          is_active?: boolean
          is_group?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      learning_providers: {
        Row: {
          contact: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          name_norm: string
          note: string | null
        }
        ComputedFields: never
        Insert: {
          contact?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          name_norm: string
          note?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          name_norm?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_providers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          href: string | null
          id: string
          resolved_at: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          severity: string
          title: string
          type: string
        }
        ComputedFields: never
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          href?: string | null
          id?: string
          resolved_at?: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          severity?: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          href?: string | null
          id?: string
          resolved_at?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          severity?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      org_unit_aliases: {
        Row: {
          alias_norm: string
          id: number
          org_unit_id: number
        }
        ComputedFields: never
        Insert: {
          alias_norm: string
          id?: never
          org_unit_id: number
        }
        Update: {
          alias_norm?: string
          id?: never
          org_unit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_unit_aliases_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      org_units: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          level: Database["public"]["Enums"]["org_level"]
          name: string
          parent_id: number | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          level: Database["public"]["Enums"]["org_level"]
          name: string
          parent_id?: number | null
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          level?: Database["public"]["Enums"]["org_level"]
          name?: string
          parent_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      public_request_attempts: {
        Row: {
          at: string
          client_hash: string
          id: number
          link_id: string | null
          outcome: string
        }
        ComputedFields: never
        Insert: {
          at?: string
          client_hash: string
          id?: never
          link_id?: string | null
          outcome: string
        }
        Update: {
          at?: string
          client_hash?: string
          id?: never
          link_id?: string | null
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_request_attempts_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "request_links"
            referencedColumns: ["id"]
          },
        ]
      }
      request_links: {
        Row: {
          created_at: string
          created_by: string | null
          disabled_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
          org_unit_id: number | null
          replaced_by: string | null
          scope: string
          token: string
          uses_count: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_used_at?: string | null
          org_unit_id?: number | null
          replaced_by?: string | null
          scope: string
          token: string
          uses_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
          org_unit_id?: number | null
          replaced_by?: string | null
          scope?: string
          token?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_links_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_links_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "request_links"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          marked_at: string
          marked_by: string | null
          participant_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        ComputedFields: never
        Insert: {
          marked_at?: string
          marked_by?: string | null
          participant_id: string
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          marked_at?: string
          marked_by?: string | null
          participant_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "training_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          kind: string
          name: string
          name_norm: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          kind?: string
          name: string
          name_norm: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          name_norm?: string
        }
        Relationships: []
      }
      source_files: {
        Row: {
          file_hash: string | null
          file_name: string
          id: number
          system: string
          uploaded_at: string
          uploaded_by: string | null
        }
        ComputedFields: never
        Insert: {
          file_hash?: string | null
          file_name: string
          id?: never
          system: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_hash?: string | null
          file_name?: string
          id?: never
          system?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_records: {
        Row: {
          entity_id: string | null
          entity_table: string | null
          id: number
          last_seen_at: string
          row_hash: string
          row_number: number
          sheet: string
          source_file_id: number | null
          status: Database["public"]["Enums"]["source_record_status"]
        }
        ComputedFields: never
        Insert: {
          entity_id?: string | null
          entity_table?: string | null
          id?: never
          last_seen_at?: string
          row_hash: string
          row_number: number
          sheet: string
          source_file_id?: number | null
          status?: Database["public"]["Enums"]["source_record_status"]
        }
        Update: {
          entity_id?: string | null
          entity_table?: string | null
          id?: never
          last_seen_at?: string
          row_hash?: string
          row_number?: number
          sheet?: string
          source_file_id?: number | null
          status?: Database["public"]["Enums"]["source_record_status"]
        }
        Relationships: [
          {
            foreignKeyName: "source_records_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "source_files"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_aliases: {
        Row: {
          alias_norm: string
          id: number
          trainer_id: string
        }
        ComputedFields: never
        Insert: {
          alias_norm: string
          id?: never
          trainer_id: string
        }
        Update: {
          alias_norm?: string
          id?: never
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_aliases_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          canonical_id: string
          created_at: string
          employee_id: string | null
          full_name: string
          id: string
          kind: Database["public"]["Enums"]["trainer_kind"]
          organization: string | null
        }
        ComputedFields: never
        Insert: {
          canonical_id: string
          created_at?: string
          employee_id?: string | null
          full_name: string
          id?: string
          kind: Database["public"]["Enums"]["trainer_kind"]
          organization?: string | null
        }
        Update: {
          canonical_id?: string
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["trainer_kind"]
          organization?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      training_participants: {
        Row: {
          added_at: string
          added_by: string | null
          attended: boolean
          department_snapshot: string | null
          employee_id: string
          id: string
          note: string | null
          position_snapshot: string | null
          result: string | null
          result_note: string | null
          session_id: string | null
          training_id: string
          unit_snapshot: string | null
        }
        ComputedFields: never
        Insert: {
          added_at?: string
          added_by?: string | null
          attended?: boolean
          department_snapshot?: string | null
          employee_id: string
          id?: string
          note?: string | null
          position_snapshot?: string | null
          result?: string | null
          result_note?: string | null
          session_id?: string | null
          training_id: string
          unit_snapshot?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          attended?: boolean
          department_snapshot?: string | null
          employee_id?: string
          id?: string
          note?: string | null
          position_snapshot?: string | null
          result?: string | null
          result_note?: string | null
          session_id?: string | null
          training_id?: string
          unit_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_participants_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_participants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_participants_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_participants_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "training_participants_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
        ]
      }
      training_requests: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          budget_amount: number | null
          budget_currency: Database["public"]["Enums"]["currency_code"] | null
          canonical_id: string
          carry_forward: boolean
          comment: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          department_id: number | null
          direction: string | null
          expected_result: string | null
          format: Database["public"]["Enums"]["training_format"] | null
          goal: string | null
          id: string
          kind: Database["public"]["Enums"]["training_kind"] | null
          original_request_id: string | null
          original_year: number | null
          participants_planned: number | null
          period_raw: string | null
          plan_year: number
          planned_year: number | null
          priority: string
          request_date: string | null
          request_link_id: string | null
          requester_id: string | null
          requester_raw: string | null
          status: Database["public"]["Enums"]["request_status"]
          submitted_via: string
          topic: string
          trainer_raw: string | null
          unit_id: number | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          canonical_id: string
          carry_forward?: boolean
          comment?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: number | null
          direction?: string | null
          expected_result?: string | null
          format?: Database["public"]["Enums"]["training_format"] | null
          goal?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["training_kind"] | null
          original_request_id?: string | null
          original_year?: number | null
          participants_planned?: number | null
          period_raw?: string | null
          plan_year: number
          planned_year?: number | null
          priority?: string
          request_date?: string | null
          request_link_id?: string | null
          requester_id?: string | null
          requester_raw?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_via?: string
          topic: string
          trainer_raw?: string | null
          unit_id?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          canonical_id?: string
          carry_forward?: boolean
          comment?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: number | null
          direction?: string | null
          expected_result?: string | null
          format?: Database["public"]["Enums"]["training_format"] | null
          goal?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["training_kind"] | null
          original_request_id?: string | null
          original_year?: number | null
          participants_planned?: number | null
          period_raw?: string | null
          plan_year?: number
          planned_year?: number | null
          priority?: string
          request_date?: string | null
          request_link_id?: string | null
          requester_id?: string | null
          requester_raw?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_via?: string
          topic?: string
          trainer_raw?: string | null
          unit_id?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_requests_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_link_fk"
            columns: ["request_link_id"]
            isOneToOne: false
            referencedRelation: "request_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_original_request_id_fkey"
            columns: ["original_request_id"]
            isOneToOne: false
            referencedRelation: "training_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          comment: string | null
          end_date: string
          end_time: string | null
          hours: number
          id: string
          legacy_reestr_id: number | null
          location: string | null
          room: string | null
          session_no: number
          start_date: string
          start_time: string | null
          status: string
          trainer_id: string | null
          training_id: string
        }
        ComputedFields: never
        Insert: {
          comment?: string | null
          end_date: string
          end_time?: string | null
          hours: number
          id?: string
          legacy_reestr_id?: number | null
          location?: string | null
          room?: string | null
          session_no: number
          start_date: string
          start_time?: string | null
          status?: string
          trainer_id?: string | null
          training_id: string
        }
        Update: {
          comment?: string | null
          end_date?: string
          end_time?: string | null
          hours?: number
          id?: string
          legacy_reestr_id?: number | null
          location?: string | null
          room?: string | null
          session_no?: number
          start_date?: string
          start_time?: string | null
          status?: string
          trainer_id?: string | null
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "training_sessions_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
        ]
      }
      training_trainers: {
        Row: {
          created_at: string
          id: string
          role: string
          trainer_id: string
          training_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          role?: string
          trainer_id: string
          training_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          trainer_id?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_trainers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_trainers_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_trainers_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "training_trainers_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          canonical_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          event_type_id: number
          format: Database["public"]["Enums"]["training_format"]
          hours: number
          id: string
          kind: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id: number | null
          location: string | null
          organizer: string | null
          participants_planned: number | null
          provider_id: string | null
          request_id: string | null
          result_summary: string | null
          source_confirmed: boolean
          source_type: Database["public"]["Enums"]["source_type"]
          start_date: string
          status: Database["public"]["Enums"]["training_status"]
          title: string
          unplanned_reason:
            | Database["public"]["Enums"]["unplanned_reason"]
            | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          canonical_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          event_type_id: number
          format: Database["public"]["Enums"]["training_format"]
          hours: number
          id?: string
          kind: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id?: number | null
          location?: string | null
          organizer?: string | null
          participants_planned?: number | null
          provider_id?: string | null
          request_id?: string | null
          result_summary?: string | null
          source_confirmed?: boolean
          source_type: Database["public"]["Enums"]["source_type"]
          start_date: string
          status: Database["public"]["Enums"]["training_status"]
          title: string
          unplanned_reason?:
            | Database["public"]["Enums"]["unplanned_reason"]
            | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          canonical_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          event_type_id?: number
          format?: Database["public"]["Enums"]["training_format"]
          hours?: number
          id?: string
          kind?: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id?: number | null
          location?: string | null
          organizer?: string | null
          participants_planned?: number | null
          provider_id?: string | null
          request_id?: string | null
          result_summary?: string | null
          source_confirmed?: boolean
          source_type?: Database["public"]["Enums"]["source_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["training_status"]
          title?: string
          unplanned_reason?:
            | Database["public"]["Enums"]["unplanned_reason"]
            | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainings_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "learning_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "learning_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "training_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_certificates: {
        Row: {
          archived_at: string | null
          cert_type: string | null
          certificate_number: string | null
          created_at: string | null
          created_by: string | null
          days_left: number | null
          document_id: string | null
          employee_id: string | null
          exam_id: string | null
          expiration_date: string | null
          id: string | null
          issue_date: string | null
          issuing_organization: string | null
          name: string | null
          notes: string | null
          provider_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          skill_id: number | null
          status: string | null
          training_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          cert_type?: string | null
          certificate_number?: string | null
          created_at?: string | null
          created_by?: string | null
          days_left?: never
          document_id?: string | null
          employee_id?: string | null
          exam_id?: string | null
          expiration_date?: string | null
          id?: string | null
          issue_date?: string | null
          issuing_organization?: string | null
          name?: string | null
          notes?: string | null
          provider_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          skill_id?: number | null
          status?: never
          training_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          cert_type?: string | null
          certificate_number?: string | null
          created_at?: string | null
          created_by?: string | null
          days_left?: never
          document_id?: string | null
          employee_id?: string | null
          exam_id?: string | null
          expiration_date?: string | null
          id?: string | null
          issue_date?: string | null
          issuing_organization?: string | null
          name?: string | null
          notes?: string | null
          provider_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          skill_id?: number | null
          status?: never
          training_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_exam_fk"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "learning_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_financials"
            referencedColumns: ["training_id"]
          },
          {
            foreignKeyName: "certificates_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "v_training_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dq_source_logic: {
        Row: {
          entity_id: string | null
          message: string | null
          rule_code: string | null
          severity: Database["public"]["Enums"]["dq_severity"] | null
        }
        ComputedFields: never
        Relationships: []
      }
      v_training_financials: {
        Row: {
          actual_tjs: number | null
          cost_per_participant_tjs: number | null
          financial_access:
            | Database["public"]["Enums"]["financial_access"]
            | null
          participants: number | null
          training_id: string | null
        }
        ComputedFields: never
        Relationships: []
      }
      v_training_list: {
        Row: {
          actual_tjs: number | null
          archived_at: string | null
          attendance_mode: boolean | null
          canonical_id: string | null
          end_date: string | null
          event_type_code: string | null
          event_type_id: number | null
          event_type_name: string | null
          format: Database["public"]["Enums"]["training_format"] | null
          hours: number | null
          id: string | null
          kind: Database["public"]["Enums"]["training_kind"] | null
          location: string | null
          man_hours: number | null
          organizer: string | null
          participants: number | null
          participants_planned: number | null
          provider_id: string | null
          request_id: string | null
          source_confirmed: boolean | null
          source_type: Database["public"]["Enums"]["source_type"] | null
          start_date: string | null
          status: Database["public"]["Enums"]["training_status"] | null
          title: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "trainings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "learning_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "learning_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "training_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actual_total: { Args: { p_training: string }; Returns: number }
      add_employee_alias: {
        Args: { p_alias: string; p_employee: string; p_reason: string }
        Returns: undefined
      }
      add_employee_skill: {
        Args: { p: Json; p_reason?: string }
        Returns: string
      }
      add_expense: {
        Args: {
          p_amount: number
          p_category: number
          p_comment: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_date: string
          p_reason: string
          p_training: string
        }
        Returns: string
      }
      add_participants: {
        Args: { p_employees: string[]; p_reason?: string; p_training: string }
        Returns: number
      }
      add_participants_by_unit: {
        Args: { p_org_unit: number; p_reason?: string; p_training: string }
        Returns: number
      }
      app_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      approve_budget_version: {
        Args: { p_version: number }
        Returns: undefined
      }
      approved_version: { Args: { p_year: number }; Returns: number }
      archive_document: {
        Args: { p_archived: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      archive_training: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      attention_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          cnt: number
          href: string
          kind: string
          label: string
          severity: string
        }[]
      }
      bootstrap_first_admin: {
        Args: { p_email: string; p_full_name: string }
        Returns: string
      }
      budget_version_locked: { Args: { p_version: number }; Returns: boolean }
      bulk_update_employees: {
        Args: { p_ids: string[]; p_patch: Json; p_reason: string }
        Returns: number
      }
      can_doc: { Args: { p_type: string; p_write: boolean }; Returns: boolean }
      can_import: { Args: { p_entity: string }; Returns: boolean }
      cancel_agreement: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      certificate_status: {
        Args: { p_exp: string; p_revoked: string }
        Returns: string
      }
      confirm_document: { Args: { p_id: string }; Returns: undefined }
      confirm_funding_policy: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      cost_per_participant: { Args: { p_training: string }; Returns: number }
      create_agreement: {
        Args: { p: Json; p_reason?: string }
        Returns: string
      }
      create_budget_revision: {
        Args: { p_from: number; p_reason: string }
        Returns: number
      }
      create_certificate: {
        Args: { p: Json; p_reason?: string }
        Returns: string
      }
      create_employee: { Args: { p: Json; p_reason?: string }; Returns: string }
      create_exam: { Args: { p: Json; p_reason?: string }; Returns: string }
      create_org_unit: { Args: { p: Json; p_reason?: string }; Returns: number }
      create_request: { Args: { p: Json; p_reason?: string }; Returns: string }
      create_request_link: {
        Args: { p: Json; p_reason?: string }
        Returns: string
      }
      create_training: { Args: { p: Json; p_reason?: string }; Returns: string }
      create_training_from_request: {
        Args: { p?: Json; p_reason?: string; p_request: string }
        Returns: string
      }
      create_training_with_participants: {
        Args: { p: Json; p_employees: string[]; p_reason?: string }
        Returns: string
      }
      dearmor: { Args: { "": string }; Returns: string }
      delete_session: {
        Args: { p_reason: string; p_session: string }
        Returns: undefined
      }
      department_participation: {
        Args: { p_year: number }
        Returns: {
          department: string
          events: number
          man_hours: number
          participants: number
          unique_employees: number
        }[]
      }
      doc_is_financial: { Args: { p_type: string }; Returns: boolean }
      dq_resolve: {
        Args: { p_action: string; p_issue: number; p_reason?: string }
        Returns: undefined
      }
      dq_scan: {
        Args: Record<PropertyKey, never>
        Returns: {
          auto_fixed: number
          opened: number
          total_open: number
        }[]
      }
      dq_scan_lifecycle: {
        Args: Record<PropertyKey, never>
        Returns: {
          auto_fixed: number
          opened: number
          total_open: number
        }[]
      }
      employee_dossier: {
        Args: { p_employee: string }
        Returns: {
          cost_share_tjs: number
          department_at_time: string
          end_date: string
          hours: number
          kind: Database["public"]["Enums"]["training_kind"]
          position_at_time: string
          source_type: Database["public"]["Enums"]["source_type"]
          start_date: string
          title: string
          training_id: string
          unit_at_time: string
          year: number
        }[]
      }
      employee_learning_summary: {
        Args: { p_employee: string }
        Returns: {
          certificates_active: number
          certificates_total: number
          company_spent_tjs: number
          employee_obligation_tjs: number
          events_count: number
          exams_failed: number
          exams_passed: number
          exams_total: number
          individual_education_tjs: number
          man_hours: number
          outstanding_obligation_tjs: number
          planned_count: number
          unplanned_count: number
        }[]
      }
      employee_timeline: {
        Args: { p_employee: string }
        Returns: {
          detail: string
          event_date: string
          kind: string
          ref_id: string
          ref_table: string
          status: string
          title: string
        }[]
      }
      ensure_attendance_mode: {
        Args: { p_training: string }
        Returns: undefined
      }
      entity_audit: {
        Args: { p_id: string; p_limit?: number; p_table: string }
        Returns: {
          action: string
          at: string
          changes: Json
          id: number
          new_row: Json
          old_row: Json
          reason: string
          row_id: string
          table_name: string
          user_id: string
          user_name: string
        }[]
      }
      evaluate_agreement: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      feedback_summary: {
        Args: { p_feedback_training: string }
        Returns: {
          answers: number
          avg_score: number
          block: Database["public"]["Enums"]["feedback_block"]
          question_no: number
        }[]
      }
      financial_access_state: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["financial_access"]
      }
      find_org_units: {
        Args: {
          p_level: Database["public"]["Enums"]["org_level"]
          p_name: string
          p_parent?: number
        }
        Returns: number[]
      }
      fx_rate_on: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_date: string
        }
        Returns: {
          rate: number
          rate_date: string
        }[]
      }
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      global_search: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          href: string
          id: string
          kind: string
          subtitle: string
          title: string
        }[]
      }
      global_search_ext: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          href: string
          id: string
          kind: string
          subtitle: string
          title: string
        }[]
      }
      has_attendance: { Args: { p_training: string }; Returns: boolean }
      has_financial_access: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      import_analyze_row: {
        Args: { p_entity: string; p_in: Json; p_options: Json }
        Returns: Json
      }
      import_analyze_row_fast: {
        Args: { p_entity: string; p_in: Json; p_options: Json }
        Returns: Json
      }
      import_bool: { Args: { p: string }; Returns: boolean }
      import_cancel: {
        Args: { p_job: string; p_reason: string }
        Returns: undefined
      }
      import_commit: {
        Args: { p_job: string; p_reason?: string }
        Returns: Json
      }
      import_commit_batch: {
        Args: { p_job: string; p_limit?: number; p_reason?: string }
        Returns: Json
      }
      import_dq_sync: {
        Args: {
          p_code: string
          p_job: string
          p_message: string
          p_open: boolean
          p_row: number
        }
        Returns: undefined
      }
      import_lineage: {
        Args: {
          p_entity: string
          p_hash: string
          p_job: string
          p_row_no: number
          p_table: string
        }
        Returns: undefined
      }
      import_resolve_row: {
        Args: { p_decision: string; p_match?: string; p_row: number }
        Returns: undefined
      }
      import_row_key: {
        Args: { p_analyzed: Json; p_data: Json; p_entity: string }
        Returns: string
      }
      import_stage: {
        Args: {
          p_entity: string
          p_file_hash: string
          p_file_name: string
          p_mapping: Json
          p_options: Json
          p_rows: Json
          p_source: string
        }
        Returns: string
      }
      import_stage_abort: { Args: { p_job: string }; Returns: string }
      import_stage_append: {
        Args: { p_job: string; p_rows: Json }
        Returns: Json
      }
      import_stage_begin: {
        Args: {
          p_entity: string
          p_file_hash: string
          p_file_name: string
          p_mapping: Json
          p_options: Json
          p_source: string
          p_token: string
          p_total: number
        }
        Returns: string
      }
      import_stage_finish: { Args: { p_job: string }; Returns: string }
      is_long_program: { Args: { p_training: string }; Returns: boolean }
      kpi_year: {
        Args: { p_year: number }
        Returns: {
          delivered_count: number
          delivered_man_hours: number
          delivered_unique_participants: number
          financial_access: Database["public"]["Enums"]["financial_access"]
          financial_actual_tjs: number
          in_progress_count: number
          plan_status: string
          plan_tjs: number
          plan_usd: number
          unplanned_delivered_count: number
          unplanned_delivered_pct: number
          unplanned_financial_actual_tjs: number
          unplanned_unconfirmed_count: number
          variance_tjs: number
        }[]
      }
      lifecycle_kpis: {
        Args: { p_year: number }
        Returns: {
          actual_cost_tjs: number
          answered: number
          avg_feedback: number
          certificates_issued: number
          cost_per_learning_hour: number
          cost_per_participant: number
          delivered_events: number
          exams_passed: number
          exams_total: number
          invited: number
          man_hours: number
          participants: number
          planned_events: number
          response_rate: number
          unique_trained: number
          unplanned_events: number
        }[]
      }
      link_request: {
        Args: {
          p_confirm?: boolean
          p_reason?: string
          p_request: string
          p_source_type?: Database["public"]["Enums"]["source_type"]
          p_training: string
        }
        Returns: undefined
      }
      man_hours: { Args: { p_training: string }; Returns: number }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      match_employee_candidates: {
        Args: { p_active_only?: boolean; p_code?: string; p_name: string }
        Returns: {
          department_id: number
          employee_id: string
          full_name: string
          is_active: boolean
          match_kind: string
          position: string
          unit_id: number
        }[]
      }
      match_names: {
        Args: { p_codes?: string[]; p_names: string[] }
        Returns: Json
      }
      move_org_unit: {
        Args: { p_id: number; p_new_parent: number; p_reason: string }
        Returns: undefined
      }
      name_key: { Args: { p: string }; Returns: string }
      next_agreement_code: { Args: { p_year: number }; Returns: string }
      next_employee_code: { Args: Record<PropertyKey, never>; Returns: string }
      next_exam_code: { Args: { p_year: number }; Returns: string }
      next_request_code: { Args: { p_year: number }; Returns: string }
      next_training_code: { Args: { p_year: number }; Returns: string }
      norm_name: { Args: { p: string }; Returns: string }
      notify_scan: { Args: Record<PropertyKey, never>; Returns: number }
      parse_date_text: { Args: { p: string }; Returns: string }
      participants_count: { Args: { p_training: string }; Returns: number }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      planned_total_tjs: { Args: { p_version: number }; Returns: number }
      planned_total_usd: { Args: { p_version: number }; Returns: number }
      public_request_options: { Args: { p_token: string }; Returns: Json }
      record_feedback_response: {
        Args: { p_comment?: string; p_participant: string; p_scores: Json }
        Returns: string
      }
      record_repayment: {
        Args: {
          p_agreement: string
          p_amount: number
          p_comment?: string
          p_paid_on: string
        }
        Returns: string
      }
      record_source_sync: {
        Args: { p_error?: string; p_job: string; p_source: string }
        Returns: Json
      }
      regenerate_request_link: {
        Args: { p_id: string; p_reason: string }
        Returns: string
      }
      register_document: { Args: { p: Json }; Returns: Json }
      remove_employee_alias: {
        Args: { p_alias: number; p_reason: string }
        Returns: undefined
      }
      remove_participant: {
        Args: { p_participant: string; p_reason: string }
        Returns: undefined
      }
      remove_training_trainer: {
        Args: { p_reason: string; p_trainer: string; p_training: string }
        Returns: undefined
      }
      rename_org_unit: {
        Args: { p_id: number; p_name: string; p_reason: string }
        Returns: undefined
      }
      req_reason: { Args: { p_reason: string }; Returns: string }
      req_role: {
        Args: { p_roles: Database["public"]["Enums"]["app_role"][] }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      reveal_respondent: {
        Args: { p_reason: string; p_response: string }
        Returns: {
          employee_id: string
          respondent_raw: string
        }[]
      }
      revert_change: {
        Args: { p_audit_id: number; p_reason: string }
        Returns: undefined
      }
      review_obligation: {
        Args: { p_id: string; p_note: string; p_reason: string }
        Returns: undefined
      }
      revoke_certificate: {
        Args: { p_id: string; p_reason: string; p_revoked: boolean }
        Returns: undefined
      }
      save_import_source: { Args: { p: Json; p_id?: string }; Returns: string }
      saving_amount_tjs: { Args: { p_year: number }; Returns: number }
      saving_percent: { Args: { p_year: number }; Returns: number }
      send_feedback_invitations: {
        Args: { p_reason?: string; p_training: string }
        Returns: number
      }
      set_attendance: {
        Args: { p_reason: string; p_updates: Json }
        Returns: number
      }
      set_exam_cost: {
        Args: { p: Json; p_exam: string; p_reason?: string }
        Returns: undefined
      }
      set_exam_result: {
        Args: {
          p_id: string
          p_note?: string
          p_reason?: string
          p_result: string
          p_score?: number
        }
        Returns: undefined
      }
      set_org_unit_active: {
        Args: { p_active: boolean; p_id: number; p_reason: string }
        Returns: undefined
      }
      set_participant_result: {
        Args: {
          p_note: string
          p_participant: string
          p_reason: string
          p_result: string
        }
        Returns: undefined
      }
      set_public_request_open: {
        Args: { p_open: boolean; p_reason: string }
        Returns: undefined
      }
      set_request_archived: {
        Args: { p_archived: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      set_request_details: {
        Args: { p: Json; p_id: string }
        Returns: undefined
      }
      set_request_link_active: {
        Args: { p_active: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      set_session_details: {
        Args: { p: Json; p_reason?: string; p_session: string }
        Returns: undefined
      }
      set_training_archived: {
        Args: { p_archived: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      set_training_trainer: {
        Args: {
          p_reason?: string
          p_role?: string
          p_trainer: string
          p_training: string
        }
        Returns: undefined
      }
      submit_public_request: {
        Args: { p: Json; p_client: string; p_token: string }
        Returns: Json
      }
      trainer_performance: {
        Args: { p_year: number }
        Returns: {
          avg_trainer_score: number
          events: number
          kind: Database["public"]["Enums"]["trainer_kind"]
          man_hours: number
          organization: string
          participants: number
          responses: number
          scores_hidden: boolean
          trainer: string
          trainer_id: string
        }[]
      }
      training_feedback_summary: {
        Args: { p_training: string }
        Returns: {
          answered: number
          final_score: number
          invited: number
          materials: number
          org: number
          response_rate: number
          scores_hidden: boolean
          trainer: number
        }[]
      }
      training_results: {
        Args: { p_training: string }
        Returns: {
          attended: boolean
          certificate_id: string
          certificate_number: string
          employee_id: string
          exam_result: string
          full_name: string
          participant_id: string
          result: string
          sessions_present: number
          sessions_total: number
          status: string
        }[]
      }
      training_summary: {
        Args: { p_training: string }
        Returns: {
          actual_cost_tjs: number
          actual_man_hours: number
          added_participants: number
          budget_tjs: number
          completed_participants: number
          cost_per_learning_hour: number
          cost_per_participant: number
          planned_hours: number
          planned_participants: number
          present_participants: number
          remaining_budget_tjs: number
          sessions: number
          trainers: number
        }[]
      }
      training_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      unplanned_stats: {
        Args: { p_year: number }
        Returns: {
          all_completed_count: number
          unplanned_actual_cost: number
          unplanned_hours: number
          unplanned_participants: number
          unplanned_percentage: number
          unplanned_training_count: number
        }[]
      }
      update_agreement: {
        Args: { p_id: string; p_patch: Json; p_reason?: string }
        Returns: undefined
      }
      update_certificate: {
        Args: { p_id: string; p_patch: Json; p_reason?: string }
        Returns: undefined
      }
      update_employee: {
        Args: { p_id: string; p_patch: Json; p_reason?: string }
        Returns: undefined
      }
      update_exam: {
        Args: { p_id: string; p_patch: Json; p_reason?: string }
        Returns: undefined
      }
      update_expense: {
        Args: { p_id: string; p_patch: Json; p_reason: string }
        Returns: undefined
      }
      update_request: {
        Args: { p_id: string; p_patch: Json; p_reason?: string }
        Returns: undefined
      }
      update_training: {
        Args: { p_id: string; p_patch: Json; p_reason?: string }
        Returns: undefined
      }
      upsert_event_type: {
        Args: { p: Json; p_id: number; p_reason?: string }
        Returns: number
      }
      upsert_funding_policy: {
        Args: { p: Json; p_id: string; p_reason?: string }
        Returns: string
      }
      upsert_goal: {
        Args: { p: Json; p_id: string; p_reason?: string }
        Returns: string
      }
      upsert_provider: {
        Args: { p: Json; p_id: string; p_reason?: string }
        Returns: string
      }
      upsert_session: {
        Args: {
          p: Json
          p_reason?: string
          p_session: string
          p_training: string
        }
        Returns: string
      }
      upsert_skill: {
        Args: { p: Json; p_id: number; p_reason?: string }
        Returns: number
      }
      upsert_trainer: { Args: { p: Json; p_trainer?: string }; Returns: string }
      utilization_percent: { Args: { p_year: number }; Returns: number }
      variance_tjs: { Args: { p_year: number }; Returns: number }
      void_expense: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      void_repayment: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "ADMIN" | "ACADEMY_MANAGER" | "HR" | "FINANCE" | "VIEWER"
      attendance_status: "PRESENT" | "ABSENT" | "EXCUSED"
      budget_status: "DRAFT" | "APPROVED" | "CANCELLED" | "ARCHIVED"
      currency_code: "TJS" | "USD" | "EUR" | "RUB" | "UZS" | "KZT"
      dq_severity: "CRITICAL" | "ERROR" | "WARNING" | "INFO"
      feedback_block: "MATERIALS" | "TRAINER" | "ORG" | "APPLICATION"
      financial_access: "GRANTED" | "FINANCIAL_DATA_RESTRICTED"
      org_level: "DEPARTMENT" | "UNIT"
      request_status:
        | "NEW"
        | "REVIEW"
        | "APPROVED"
        | "REJECTED"
        | "PLANNED"
        | "DONE"
        | "CARRIED_FORWARD"
      source_record_status:
        | "ACTIVE"
        | "CHANGED"
        | "MISSING_FROM_SOURCE"
        | "CONFLICT"
        | "ARCHIVED"
      source_type: "PLANNED" | "UNPLANNED"
      trainer_kind: "INTERNAL" | "EXTERNAL" | "ORGANIZATION"
      training_format: "ONLINE" | "OFFLINE" | "BLENDED"
      training_kind: "INTERNAL" | "EXTERNAL" | "UNSPECIFIED"
      training_status:
        | "DRAFT"
        | "PLANNED"
        | "APPROVED"
        | "REGISTERED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
        | "POSTPONED"
        | "NOT_HELD"
      unplanned_reason:
        | "URGENT_BUSINESS_NEED"
        | "MANAGEMENT_REQUEST"
        | "LEGAL_REQUIREMENT"
        | "NEW_PROJECT"
        | "EMPLOYEE_NEED"
        | "EXTERNAL_OPPORTUNITY"
        | "OTHER"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["ADMIN", "ACADEMY_MANAGER", "HR", "FINANCE", "VIEWER"],
      attendance_status: ["PRESENT", "ABSENT", "EXCUSED"],
      budget_status: ["DRAFT", "APPROVED", "CANCELLED", "ARCHIVED"],
      currency_code: ["TJS", "USD", "EUR", "RUB", "UZS", "KZT"],
      dq_severity: ["CRITICAL", "ERROR", "WARNING", "INFO"],
      feedback_block: ["MATERIALS", "TRAINER", "ORG", "APPLICATION"],
      financial_access: ["GRANTED", "FINANCIAL_DATA_RESTRICTED"],
      org_level: ["DEPARTMENT", "UNIT"],
      request_status: [
        "NEW",
        "REVIEW",
        "APPROVED",
        "REJECTED",
        "PLANNED",
        "DONE",
        "CARRIED_FORWARD",
      ],
      source_record_status: [
        "ACTIVE",
        "CHANGED",
        "MISSING_FROM_SOURCE",
        "CONFLICT",
        "ARCHIVED",
      ],
      source_type: ["PLANNED", "UNPLANNED"],
      trainer_kind: ["INTERNAL", "EXTERNAL", "ORGANIZATION"],
      training_format: ["ONLINE", "OFFLINE", "BLENDED"],
      training_kind: ["INTERNAL", "EXTERNAL", "UNSPECIFIED"],
      training_status: [
        "DRAFT",
        "PLANNED",
        "APPROVED",
        "REGISTERED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "POSTPONED",
        "NOT_HELD",
      ],
      unplanned_reason: [
        "URGENT_BUSINESS_NEED",
        "MANAGEMENT_REQUEST",
        "LEGAL_REQUIREMENT",
        "NEW_PROJECT",
        "EMPLOYEE_NEED",
        "EXTERNAL_OPPORTUNITY",
        "OTHER",
      ],
    },
  },
} as const
