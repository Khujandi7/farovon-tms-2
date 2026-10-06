// FAROVON TMS 2.0 — типы БД. База: Production после Phase 1.5 M8 + локально применённые миграции Phase 3A (M10–M13).
// ВНИМАНИЕ: M10–M13 НЕ применены в Production (ждут отдельного подтверждения). После их применения перегенерировать из Supabase.
// Сгенерировано @supabase/postgres-meta по локальной БД (supabase/tests/run_local.sh); структура Phase 1–2.2 совпадает с Production.
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
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string | null
        }
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
          employee_id: string
          phone: string | null
        }
        Insert: {
          employee_id: string
          phone?: string | null
        }
        Update: {
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
      employees: {
        Row: {
          canonical_id: string
          created_at: string
          department_id: number | null
          full_name: string
          id: string
          is_active: boolean
          name_norm: string
          position: string | null
          unit_id: number | null
          updated_at: string
        }
        Insert: {
          canonical_id: string
          created_at?: string
          department_id?: number | null
          full_name: string
          id?: string
          is_active?: boolean
          name_norm: string
          position?: string | null
          unit_id?: number | null
          updated_at?: string
        }
        Update: {
          canonical_id?: string
          created_at?: string
          department_id?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          name_norm?: string
          position?: string | null
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
      expense_categories: {
        Row: {
          code: string
          group_code: string
          id: number
          is_trainer_fee: boolean
          name: string
        }
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
        ]
      }
      feedback_answers: {
        Row: {
          block: Database["public"]["Enums"]["feedback_block"]
          question_no: number
          response_id: string
          score: number
        }
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
      feedback_respondents: {
        Row: {
          dedupe_key: string
          employee_id: string | null
          match_confidence: number | null
          match_status: string
          respondent_raw: string
          response_id: string
        }
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
        ]
      }
      fx_rates: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          rate_date: string
          rate_to_tjs: number
          source: string | null
        }
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
      org_unit_aliases: {
        Row: {
          alias_norm: string
          id: number
          org_unit_id: number
        }
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
      session_attendance: {
        Row: {
          marked_at: string
          marked_by: string | null
          participant_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
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
      source_files: {
        Row: {
          file_hash: string | null
          file_name: string
          id: number
          system: string
          uploaded_at: string
          uploaded_by: string | null
        }
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
        }
        Insert: {
          canonical_id: string
          created_at?: string
          employee_id?: string | null
          full_name: string
          id?: string
          kind: Database["public"]["Enums"]["trainer_kind"]
        }
        Update: {
          canonical_id?: string
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["trainer_kind"]
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
          session_id: string | null
          training_id: string
          unit_snapshot: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          attended?: boolean
          department_snapshot?: string | null
          employee_id: string
          id?: string
          note?: string | null
          position_snapshot?: string | null
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
          created_at: string
          created_by: string | null
          department_id: number | null
          direction: string | null
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
          request_date: string | null
          requester_id: string | null
          requester_raw: string | null
          status: Database["public"]["Enums"]["request_status"]
          topic: string
          trainer_raw: string | null
          unit_id: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          canonical_id: string
          carry_forward?: boolean
          comment?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: number | null
          direction?: string | null
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
          request_date?: string | null
          requester_id?: string | null
          requester_raw?: string | null
          status?: Database["public"]["Enums"]["request_status"]
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
          created_at?: string
          created_by?: string | null
          department_id?: number | null
          direction?: string | null
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
          request_date?: string | null
          requester_id?: string | null
          requester_raw?: string | null
          status?: Database["public"]["Enums"]["request_status"]
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
          hours: number
          id: string
          legacy_reestr_id: number | null
          location: string | null
          session_no: number
          start_date: string
          training_id: string
        }
        Insert: {
          comment?: string | null
          end_date: string
          hours: number
          id?: string
          legacy_reestr_id?: number | null
          location?: string | null
          session_no: number
          start_date: string
          training_id: string
        }
        Update: {
          comment?: string | null
          end_date?: string
          hours?: number
          id?: string
          legacy_reestr_id?: number | null
          location?: string | null
          session_no?: number
          start_date?: string
          training_id?: string
        }
        Relationships: [
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
        ]
      }
      training_trainers: {
        Row: {
          trainer_id: string
          training_id: string
        }
        Insert: {
          trainer_id: string
          training_id: string
        }
        Update: {
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
          format: Database["public"]["Enums"]["training_format"]
          hours: number
          id: string
          kind: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id: number | null
          location: string | null
          participants_planned: number | null
          request_id: string | null
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
          format: Database["public"]["Enums"]["training_format"]
          hours: number
          id?: string
          kind: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id?: number | null
          location?: string | null
          participants_planned?: number | null
          request_id?: string | null
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
          format?: Database["public"]["Enums"]["training_format"]
          hours?: number
          id?: string
          kind?: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id?: number | null
          location?: string | null
          participants_planned?: number | null
          request_id?: string | null
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
      v_dq_source_logic: {
        Row: {
          entity_id: string | null
          message: string | null
          rule_code: string | null
          severity: Database["public"]["Enums"]["dq_severity"] | null
        }
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
        Relationships: []
      }
    }
    Functions: {
      actual_total: { Args: { p_training: string }; Returns: number }
      add_employee_alias: {
        Args: { p_alias: string; p_employee: string; p_reason: string }
        Returns: undefined
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
      archive_training: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      bootstrap_first_admin: {
        Args: { p_email: string; p_full_name: string }
        Returns: string
      }
      budget_version_locked: { Args: { p_version: number }; Returns: boolean }
      cost_per_participant: { Args: { p_training: string }; Returns: number }
      create_budget_revision: {
        Args: { p_from: number; p_reason: string }
        Returns: number
      }
      create_employee: { Args: { p: Json; p_reason?: string }; Returns: string }
      create_request: { Args: { p: Json; p_reason?: string }; Returns: string }
      create_training: { Args: { p: Json; p_reason?: string }; Returns: string }
      dearmor: { Args: { "": string }; Returns: string }
      delete_session: {
        Args: { p_reason: string; p_session: string }
        Returns: undefined
      }
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
      has_attendance: { Args: { p_training: string }; Returns: boolean }
      has_financial_access: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
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
      next_employee_code: { Args: Record<PropertyKey, never>; Returns: string }
      next_request_code: { Args: { p_year: number }; Returns: string }
      next_training_code: { Args: { p_year: number }; Returns: string }
      norm_name: { Args: { p: string }; Returns: string }
      participants_count: { Args: { p_training: string }; Returns: number }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      planned_total_tjs: { Args: { p_version: number }; Returns: number }
      planned_total_usd: { Args: { p_version: number }; Returns: number }
      remove_employee_alias: {
        Args: { p_alias: number; p_reason: string }
        Returns: undefined
      }
      remove_participant: {
        Args: { p_participant: string; p_reason: string }
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
      saving_amount_tjs: { Args: { p_year: number }; Returns: number }
      saving_percent: { Args: { p_year: number }; Returns: number }
      set_attendance: {
        Args: { p_reason: string; p_updates: Json }
        Returns: number
      }
      set_request_archived: {
        Args: { p_archived: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      set_training_archived: {
        Args: { p_archived: boolean; p_id: string; p_reason: string }
        Returns: undefined
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
      update_employee: {
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
      upsert_session: {
        Args: {
          p: Json
          p_reason?: string
          p_session: string
          p_training: string
        }
        Returns: string
      }
      utilization_percent: { Args: { p_year: number }; Returns: number }
      variance_tjs: { Args: { p_year: number }; Returns: number }
      void_expense: {
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
        | "PLANNED"
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
        "PLANNED",
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
