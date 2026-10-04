// FAROVON TMS 2.0 — типы БД, сгенерированы из Supabase (ylfrblprjlzfcdutswax) после Phase 1.5 M7, 04.10.2026.
// НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ. Перегенерировать после каждой миграции.
// ВНИМАНИЕ: M8 (удаление устаревших столбцов feedback_responses: employee_id, respondent_raw, dedupe_key,
// match_confidence, match_status) в Supabase ещё не применена, поэтому эти столбцы пока есть в типах.
// Использовать их в коде нельзя: личность респондента только через feedback_respondents / reveal_respondent().
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
          entity_id: string | null
          entity_table: string | null
          id: number
          message: string
          rule_code: string
          severity: Database["public"]["Enums"]["dq_severity"]
          status: string
          suggestion: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: never
          message: string
          rule_code: string
          severity: Database["public"]["Enums"]["dq_severity"]
          status?: string
          suggestion?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: never
          message?: string
          rule_code?: string
          severity?: Database["public"]["Enums"]["dq_severity"]
          status?: string
          suggestion?: string | null
        }
        Relationships: []
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
          dedupe_key: string
          employee_id: string | null
          feedback_training_id: string | null
          id: string
          is_archive: boolean
          match_confidence: number | null
          match_status: string
          respondent_raw: string
          submitted_at: string
        }
        Insert: {
          comment?: string | null
          dedupe_key: string
          employee_id?: string | null
          feedback_training_id?: string | null
          id?: string
          is_archive?: boolean
          match_confidence?: number | null
          match_status?: string
          respondent_raw: string
          submitted_at: string
        }
        Update: {
          comment?: string | null
          dedupe_key?: string
          employee_id?: string | null
          feedback_training_id?: string | null
          id?: string
          is_archive?: boolean
          match_confidence?: number | null
          match_status?: string
          respondent_raw?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
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
          attended: boolean
          department_snapshot: string | null
          employee_id: string
          id: string
          position_snapshot: string | null
          session_id: string | null
          training_id: string
          unit_snapshot: string | null
        }
        Insert: {
          attended?: boolean
          department_snapshot?: string | null
          employee_id: string
          id?: string
          position_snapshot?: string | null
          session_id?: string | null
          training_id: string
          unit_snapshot?: string | null
        }
        Update: {
          attended?: boolean
          department_snapshot?: string | null
          employee_id?: string
          id?: string
          position_snapshot?: string | null
          session_id?: string | null
          training_id?: string
          unit_snapshot?: string | null
        }
        Relationships: [
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
          budget_amount: number | null
          budget_currency: Database["public"]["Enums"]["currency_code"] | null
          canonical_id: string
          carry_forward: boolean
          comment: string | null
          created_at: string
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
        }
        Insert: {
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          canonical_id: string
          carry_forward?: boolean
          comment?: string | null
          created_at?: string
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
        }
        Update: {
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          canonical_id?: string
          carry_forward?: boolean
          comment?: string | null
          created_at?: string
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
        }
        Relationships: [
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
        ]
      }
      training_sessions: {
        Row: {
          end_date: string
          hours: number
          id: string
          legacy_reestr_id: number | null
          session_no: number
          start_date: string
          training_id: string
        }
        Insert: {
          end_date: string
          hours: number
          id?: string
          legacy_reestr_id?: number | null
          session_no: number
          start_date: string
          training_id: string
        }
        Update: {
          end_date?: string
          hours?: number
          id?: string
          legacy_reestr_id?: number | null
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
          end_date: string
          format: Database["public"]["Enums"]["training_format"]
          hours: number
          id: string
          kind: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id: number | null
          location: string | null
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
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          canonical_id: string
          comment?: string | null
          created_at?: string
          end_date: string
          format: Database["public"]["Enums"]["training_format"]
          hours: number
          id?: string
          kind: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id?: number | null
          location?: string | null
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
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          canonical_id?: string
          comment?: string | null
          created_at?: string
          end_date?: string
          format?: Database["public"]["Enums"]["training_format"]
          hours?: number
          id?: string
          kind?: Database["public"]["Enums"]["training_kind"]
          legacy_reestr_id?: number | null
          location?: string | null
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
            foreignKeyName: "trainings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "training_requests"
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
      app_role: {
        Args: never
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
        Args: never
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
      has_financial_access: { Args: never; Returns: boolean }
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
      man_hours: { Args: { p_training: string }; Returns: number }
      participants_count: { Args: { p_training: string }; Returns: number }
      planned_total_tjs: { Args: { p_version: number }; Returns: number }
      planned_total_usd: { Args: { p_version: number }; Returns: number }
      reveal_respondent: {
        Args: { p_reason: string; p_response: string }
        Returns: {
          employee_id: string
          respondent_raw: string
        }[]
      }
      saving_amount_tjs: { Args: { p_year: number }; Returns: number }
      saving_percent: { Args: { p_year: number }; Returns: number }
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
      utilization_percent: { Args: { p_year: number }; Returns: number }
      variance_tjs: { Args: { p_year: number }; Returns: number }
      void_expense: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "ADMIN" | "ACADEMY_MANAGER" | "HR" | "FINANCE" | "VIEWER"
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
