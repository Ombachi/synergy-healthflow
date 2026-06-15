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
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          doctor_id: string | null
          duration_minutes: number
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          scheduled_at: string
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessor_id: string | null
          athlete_id: string
          created_at: string
          id: string
          metrics: Json
          notes: string | null
          performed_at: string
          type: string
        }
        Insert: {
          assessor_id?: string | null
          athlete_id: string
          created_at?: string
          id?: string
          metrics?: Json
          notes?: string | null
          performed_at?: string
          type?: string
        }
        Update: {
          assessor_id?: string | null
          athlete_id?: string
          created_at?: string
          id?: string
          metrics?: Json
          notes?: string | null
          performed_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          height_cm: number | null
          id: string
          phone: string | null
          position: string | null
          resting_heart_rate: number | null
          sport: string | null
          status: string
          team: string | null
          updated_at: string
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          height_cm?: number | null
          id?: string
          phone?: string | null
          position?: string | null
          resting_heart_rate?: number | null
          sport?: string | null
          status?: string
          team?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          height_cm?: number | null
          id?: string
          phone?: string | null
          position?: string | null
          resting_heart_rate?: number | null
          sport?: string | null
          status?: string
          team?: string | null
          updated_at?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          athlete_id: string
          id: string
          recorded_at: string
          recorded_by: string | null
          session_id: string
          status: string
        }
        Insert: {
          athlete_id: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          session_id: string
          status?: string
        }
        Update: {
          athlete_id?: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          patient_id: string | null
          visit_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          patient_id?: string | null
          visit_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          patient_id?: string | null
          visit_id?: string | null
        }
        Relationships: []
      }
      clearance_records: {
        Row: {
          athlete_id: string
          cleared_by: string | null
          created_at: string
          id: string
          injury_id: string | null
          notes: string | null
          status: string
          valid_until: string | null
        }
        Insert: {
          athlete_id: string
          cleared_by?: string | null
          created_at?: string
          id?: string
          injury_id?: string | null
          notes?: string | null
          status?: string
          valid_until?: string | null
        }
        Update: {
          athlete_id?: string
          cleared_by?: string | null
          created_at?: string
          id?: string
          injury_id?: string | null
          notes?: string | null
          status?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clearance_records_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clearance_records_injury_id_fkey"
            columns: ["injury_id"]
            isOneToOne: false
            referencedRelation: "injuries"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          bio: string | null
          certification: string | null
          created_at: string
          id: string
          sport: string | null
          team: string | null
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          certification?: string | null
          created_at?: string
          id?: string
          sport?: string | null
          team?: string | null
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          certification?: string | null
          created_at?: string
          id?: string
          sport?: string | null
          team?: string | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      competitions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          opponents: string | null
          result: string | null
          scheduled_at: string | null
          sport: string | null
          team_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          opponents?: string | null
          result?: string | null
          scheduled_at?: string | null
          sport?: string | null
          team_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          opponents?: string | null
          result?: string | null
          scheduled_at?: string | null
          sport?: string | null
          team_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          accepted: boolean
          accepted_at: string | null
          consent_type: string
          created_at: string
          document_version: string
          id: string
          patient_id: string
          signed_by: string | null
          updated_at: string
        }
        Insert: {
          accepted?: boolean
          accepted_at?: string | null
          consent_type: string
          created_at?: string
          document_version?: string
          id?: string
          patient_id: string
          signed_by?: string | null
          updated_at?: string
        }
        Update: {
          accepted?: boolean
          accepted_at?: string | null
          consent_type?: string
          created_at?: string
          document_version?: string
          id?: string
          patient_id?: string
          signed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      discharge_summaries: {
        Row: {
          created_at: string
          created_by: string | null
          finalized: boolean
          finalized_at: string | null
          finalized_by: string | null
          follow_up: string | null
          id: string
          summary: string
          treatment_plan: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized?: boolean
          finalized_at?: string | null
          finalized_by?: string | null
          follow_up?: string | null
          id?: string
          summary: string
          treatment_plan?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized?: boolean
          finalized_at?: string | null
          finalized_by?: string | null
          follow_up?: string | null
          id?: string
          summary?: string
          treatment_plan?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discharge_summaries_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_profiles: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          license_number: string | null
          specialty: string | null
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          license_number?: string | null
          specialty?: string | null
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          license_number?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      goods_received_notes: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          po_id: string | null
          received_at: string
          received_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          po_id?: string | null
          received_at?: string
          received_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          po_id?: string | null
          received_at?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          batch_no: string | null
          created_at: string
          expiry_date: string | null
          grn_id: string
          id: string
          item_id: string
          location_id: string | null
          qty: number
          unit_cost_cents: number
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          grn_id: string
          id?: string
          item_id: string
          location_id?: string | null
          qty: number
          unit_cost_cents?: number
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          grn_id?: string
          id?: string
          item_id?: string
          location_id?: string | null
          qty?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      icd11_codes: {
        Row: {
          chapter: string | null
          code: string
          created_at: string
          title: string
        }
        Insert: {
          chapter?: string | null
          code: string
          created_at?: string
          title: string
        }
        Update: {
          chapter?: string | null
          code?: string
          created_at?: string
          title?: string
        }
        Relationships: []
      }
      imaging_orders: {
        Row: {
          body_part: string | null
          clinical_question: string | null
          created_at: string
          findings: string | null
          id: string
          image_path: string | null
          modality: string
          ordered_by: string | null
          patient_id: string
          performed_at: string | null
          performed_by: string | null
          priority: string | null
          report: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          body_part?: string | null
          clinical_question?: string | null
          created_at?: string
          findings?: string | null
          id?: string
          image_path?: string | null
          modality: string
          ordered_by?: string | null
          patient_id: string
          performed_at?: string | null
          performed_by?: string | null
          priority?: string | null
          report?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          body_part?: string | null
          clinical_question?: string | null
          created_at?: string
          findings?: string | null
          id?: string
          image_path?: string | null
          modality?: string
          ordered_by?: string | null
          patient_id?: string
          performed_at?: string | null
          performed_by?: string | null
          priority?: string | null
          report?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imaging_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imaging_orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      injuries: {
        Row: {
          athlete_id: string
          body_part: string
          created_at: string
          id: string
          mechanism: string | null
          notes: string | null
          reported_at: string
          reported_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          body_part: string
          created_at?: string
          id?: string
          mechanism?: string | null
          notes?: string | null
          reported_at?: string
          reported_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          body_part?: string
          created_at?: string
          id?: string
          mechanism?: string | null
          notes?: string | null
          reported_at?: string
          reported_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          approved_amount_cents: number | null
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          policy_id: string | null
          preauth_code: string | null
          processed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_amount_cents?: number | null
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          policy_id?: string | null
          preauth_code?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_amount_cents?: number | null
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          policy_id?: string | null
          preauth_code?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          insurer: string
          member_number: string
          patient_id: string
          scheme: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          insurer: string
          member_number: string
          patient_id: string
          scheme?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          insurer?: string
          member_number?: string
          patient_id?: string
          scheme?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_forms: {
        Row: {
          allergies: string | null
          conditions: string | null
          created_at: string
          current_medications: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          patient_id: string
          reason_for_visit: string | null
          submitted_at: string
          submitted_by: string | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          allergies?: string | null
          conditions?: string | null
          created_at?: string
          current_medications?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          patient_id: string
          reason_for_visit?: string | null
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          allergies?: string | null
          conditions?: string | null
          created_at?: string
          current_medications?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          patient_id?: string
          reason_for_visit?: string | null
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_forms_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_forms_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          approved_by: string | null
          batch_id: string
          created_at: string
          id: string
          qty_delta: number
          reason: string
        }
        Insert: {
          approved_by?: string | null
          batch_id: string
          created_at?: string
          id?: string
          qty_delta: number
          reason: string
        }
        Update: {
          approved_by?: string | null
          batch_id?: string
          created_at?: string
          id?: string
          qty_delta?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          quantity: number
          reorder_threshold: number
          sku: string | null
          supplier: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          quantity?: number
          reorder_threshold?: number
          sku?: string | null
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          quantity?: number
          reorder_threshold?: number
          sku?: string | null
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          by_user: string | null
          change: number
          created_at: string
          id: string
          inventory_item_id: string
          prescription_id: string | null
          reason: string | null
        }
        Insert: {
          by_user?: string | null
          change: number
          created_at?: string
          id?: string
          inventory_item_id: string
          prescription_id?: string | null
          reason?: string | null
        }
        Update: {
          by_user?: string | null
          change?: number
          created_at?: string
          id?: string
          inventory_item_id?: string
          prescription_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          kind: string
          qty: number
          ref_id: string | null
          ref_table: string | null
          unit_price_cents: number
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          kind: string
          qty?: number
          ref_id?: string | null
          ref_table?: string | null
          unit_price_cents?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          kind?: string
          qty?: number
          ref_id?: string | null
          ref_table?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_cents: number
          patient_id: string
          status: string
          total_cents: number
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_cents?: number
          patient_id: string
          status?: string
          total_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_cents?: number
          patient_id?: string
          status?: string
          total_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          clinical_notes: string | null
          created_at: string
          id: string
          ordered_by: string | null
          patient_id: string
          priority: string
          status: string
          test_id: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          clinical_notes?: string | null
          created_at?: string
          id?: string
          ordered_by?: string | null
          patient_id: string
          priority?: string
          status?: string
          test_id: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          clinical_notes?: string | null
          created_at?: string
          id?: string
          ordered_by?: string | null
          patient_id?: string
          priority?: string
          status?: string
          test_id?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          abnormal_flag: string | null
          comments: string | null
          created_at: string
          file_path: string | null
          id: string
          order_id: string
          performed_at: string | null
          performed_by: string | null
          reference_range: string | null
          result_value: string | null
          units: string | null
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          abnormal_flag?: string | null
          comments?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          order_id: string
          performed_at?: string | null
          performed_by?: string | null
          reference_range?: string | null
          result_value?: string | null
          units?: string | null
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          abnormal_flag?: string | null
          comments?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          order_id?: string
          performed_at?: string | null
          performed_by?: string | null
          reference_range?: string | null
          result_value?: string | null
          units?: string | null
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_samples: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          condition: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          sample_code: string | null
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          sample_code?: string | null
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          sample_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_samples_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_tests_catalog: {
        Row: {
          category: string | null
          code: string
          container: string | null
          created_at: string
          id: string
          name: string
          price: number | null
          reference_range: string | null
          specimen: string | null
          turnaround_hours: number | null
          units: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          container?: string | null
          created_at?: string
          id?: string
          name: string
          price?: number | null
          reference_range?: string | null
          specimen?: string | null
          turnaround_hours?: number | null
          units?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          container?: string | null
          created_at?: string
          id?: string
          name?: string
          price?: number | null
          reference_range?: string | null
          specimen?: string | null
          turnaround_hours?: number | null
          units?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      nutrition_plans: {
        Row: {
          athlete_id: string
          compliance_pct: number | null
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          nutritionist_id: string | null
          plan: Json
          start_date: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          compliance_pct?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          nutritionist_id?: string | null
          plan?: Json
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          compliance_pct?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          nutritionist_id?: string | null
          plan?: Json
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          blood_type: string | null
          chronic_conditions: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          diagnosis: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          id: string
          insurance_number: string | null
          insurance_provider: string | null
          medical_record_number: string | null
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          diagnosis?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          insurance_number?: string | null
          insurance_provider?: string | null
          medical_record_number?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          blood_type?: string | null
          chronic_conditions?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          diagnosis?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          insurance_number?: string | null
          insurance_provider?: string | null
          medical_record_number?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          id: string
          invoice_id: string
          method: string
          notes: string | null
          received_at: string
          received_by: string | null
          reference: string | null
        }
        Insert: {
          amount_cents: number
          id?: string
          invoice_id: string
          method?: string
          notes?: string | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
        }
        Update: {
          amount_cents?: number
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_records: {
        Row: {
          athlete_id: string
          id: string
          metric: string
          recorded_at: string
          recorded_by: string | null
          session_id: string | null
          unit: string | null
          value: number
        }
        Insert: {
          athlete_id: string
          id?: string
          metric: string
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          athlete_id?: string
          id?: string
          metric?: string
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_records_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_dispenses: {
        Row: {
          created_at: string
          dispensed_at: string
          dispensed_by: string | null
          id: string
          instructions: string | null
          inventory_item_id: string | null
          notes: string | null
          prescription_id: string
          quantity: number
          status: string
        }
        Insert: {
          created_at?: string
          dispensed_at?: string
          dispensed_by?: string | null
          id?: string
          instructions?: string | null
          inventory_item_id?: string | null
          notes?: string | null
          prescription_id: string
          quantity?: number
          status?: string
        }
        Update: {
          created_at?: string
          dispensed_at?: string
          dispensed_by?: string | null
          id?: string
          instructions?: string | null
          inventory_item_id?: string | null
          notes?: string | null
          prescription_id?: string
          quantity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_dispenses_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispenses_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          created_by: string | null
          dose: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medication: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dose?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dose?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_orders: {
        Row: {
          code: string | null
          created_at: string
          id: string
          notes: string | null
          ordered_by: string | null
          performed_at: string | null
          performed_by: string | null
          procedure_name: string
          status: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          ordered_by?: string | null
          performed_at?: string | null
          performed_by?: string | null
          procedure_name: string
          status?: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          ordered_by?: string | null
          performed_at?: string | null
          performed_by?: string | null
          procedure_name?: string
          status?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          onboarded: boolean
          onboarded_as: Database["public"]["Enums"]["app_role"] | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          onboarded?: boolean
          onboarded_as?: Database["public"]["Enums"]["app_role"] | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          onboarded?: boolean
          onboarded_as?: Database["public"]["Enums"]["app_role"] | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_schedules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          slot_minutes: number
          start_time: string
          user_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          slot_minutes?: number
          start_time: string
          user_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          slot_minutes?: number
          start_time?: string
          user_id?: string
          weekday?: number
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          po_id: string
          qty: number
          qty_received: number
          unit_cost_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          po_id: string
          qty: number
          qty_received?: number
          unit_cost_cents?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          po_id?: string
          qty?: number
          qty_received?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          notes: string | null
          status: string
          supplier_id: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          supplier_id: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          supplier_id?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_sessions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          progress_pct: number | null
          treatment_plan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          progress_pct?: number | null
          treatment_plan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          progress_pct?: number | null
          treatment_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_sessions_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          active: boolean
          category: string
          code: string
          created_at: string
          id: string
          name: string
          unit_price_cents: number
        }
        Insert: {
          active?: boolean
          category: string
          code: string
          created_at?: string
          id?: string
          name: string
          unit_price_cents?: number
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          unit_price_cents?: number
        }
        Relationships: []
      }
      stock_batches: {
        Row: {
          batch_no: string | null
          cost_cents: number
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          location_id: string | null
          qty_on_hand: number
          status: string
          supplier_id: string | null
        }
        Insert: {
          batch_no?: string | null
          cost_cents?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          location_id?: string | null
          qty_on_hand?: number
          status?: string
          supplier_id?: string | null
        }
        Update: {
          batch_no?: string | null
          cost_cents?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          location_id?: string | null
          qty_on_hand?: number
          status?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          created_at: string
          id: string
          in_charge_id: string | null
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          in_charge_id?: string | null
          kind?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          in_charge_id?: string | null
          kind?: string
          name?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          item_id: string
          kind: string
          location_from: string | null
          location_to: string | null
          notes: string | null
          performed_by: string | null
          qty: number
          ref_id: string | null
          ref_table: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          kind: string
          location_from?: string | null
          location_to?: string | null
          notes?: string | null
          performed_by?: string | null
          qty: number
          ref_id?: string | null
          ref_table?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          kind?: string
          location_from?: string | null
          location_to?: string | null
          notes?: string | null
          performed_by?: string | null
          qty?: number
          ref_id?: string | null
          ref_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_from_fkey"
            columns: ["location_from"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_to_fkey"
            columns: ["location_to"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_request_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          qty_approved: number | null
          qty_issued: number | null
          qty_requested: number
          request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          qty_approved?: number | null
          qty_issued?: number | null
          qty_requested: number
          request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          qty_approved?: number | null
          qty_issued?: number | null
          qty_requested?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_request_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stock_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          created_at: string
          department: string | null
          id: string
          location_id: string | null
          notes: string | null
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          payment_terms: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          jersey_no: string | null
          joined_at: string | null
          left_at: string | null
          position: string | null
          team_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          jersey_no?: string | null
          joined_at?: string | null
          left_at?: string | null
          position?: string | null
          team_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          jersey_no?: string | null
          joined_at?: string | null
          left_at?: string | null
          position?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          manager_id: string | null
          name: string
          season: string | null
          sport: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id?: string | null
          name: string
          season?: string | null
          sport?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          season?: string | null
          sport?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      thread_participants: {
        Row: {
          last_read_at: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          athlete_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          goals: string | null
          id: string
          start_date: string | null
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goals?: string | null
          id?: string
          start_date?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goals?: string | null
          id?: string
          start_date?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          focus: string | null
          id: string
          location: string | null
          plan_id: string | null
          scheduled_at: string
          status: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          focus?: string | null
          id?: string
          location?: string | null
          plan_id?: string | null
          scheduled_at: string
          status?: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          focus?: string | null
          id?: string
          location?: string | null
          plan_id?: string | null
          scheduled_at?: string
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          injury_id: string
          physio_id: string | null
          plan: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          injury_id: string
          physio_id?: string | null
          plan?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          injury_id?: string
          physio_id?: string | null
          plan?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_injury_id_fkey"
            columns: ["injury_id"]
            isOneToOne: false
            referencedRelation: "injuries"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_records: {
        Row: {
          acuity: number | null
          chief_complaint: string | null
          created_at: string
          id: string
          notes: string | null
          nurse_id: string | null
          visit_id: string
        }
        Insert: {
          acuity?: number | null
          chief_complaint?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          nurse_id?: string | null
          visit_id: string
        }
        Update: {
          acuity?: number | null
          chief_complaint?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          nurse_id?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_records_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: string
          unassigned_at: string | null
          user_id: string
          visit_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role: string
          unassigned_at?: string | null
          user_id: string
          visit_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: string
          unassigned_at?: string | null
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_assignments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_diagnoses: {
        Row: {
          created_at: string
          created_by: string | null
          diagnosis: string
          icd_code: string | null
          id: string
          is_primary: boolean
          notes: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          diagnosis: string
          icd_code?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          diagnosis?: string
          icd_code?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_diagnoses_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_queue: {
        Row: {
          called_at: string | null
          entered_at: string
          id: string
          notes: string | null
          priority: number
          queue_type: string
          served_at: string | null
          served_by: string | null
          visit_id: string
        }
        Insert: {
          called_at?: string | null
          entered_at?: string
          id?: string
          notes?: string | null
          priority?: number
          queue_type: string
          served_at?: string | null
          served_by?: string | null
          visit_id: string
        }
        Update: {
          called_at?: string | null
          entered_at?: string
          id?: string
          notes?: string | null
          priority?: number
          queue_type?: string
          served_at?: string | null
          served_by?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_queue_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_stages: {
        Row: {
          by_user: string | null
          entered_at: string
          exited_at: string | null
          id: string
          notes: string | null
          stage: string
          visit_id: string
        }
        Insert: {
          by_user?: string | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          notes?: string | null
          stage: string
          visit_id: string
        }
        Update: {
          by_user?: string | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          notes?: string | null
          stage?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_stages_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          assigned_doctor_id: string | null
          assigned_nurse_id: string | null
          billing_cleared_at: string | null
          chief_complaint: string | null
          closed_at: string | null
          created_at: string
          current_stage: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          patient_id: string
          pharmacy_cleared_at: string | null
          reason: string | null
          status: string
          triage_level: string | null
          updated_at: string
        }
        Insert: {
          assigned_doctor_id?: string | null
          assigned_nurse_id?: string | null
          billing_cleared_at?: string | null
          chief_complaint?: string | null
          closed_at?: string | null
          created_at?: string
          current_stage?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          patient_id: string
          pharmacy_cleared_at?: string | null
          reason?: string | null
          status?: string
          triage_level?: string | null
          updated_at?: string
        }
        Update: {
          assigned_doctor_id?: string | null
          assigned_nurse_id?: string | null
          billing_cleared_at?: string | null
          chief_complaint?: string | null
          closed_at?: string | null
          created_at?: string
          current_stage?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          patient_id?: string
          pharmacy_cleared_at?: string | null
          reason?: string | null
          status?: string
          triage_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals: {
        Row: {
          captured_at: string
          captured_by: string | null
          created_at: string
          diastolic_bp: number | null
          glucose_mg_dl: number | null
          heart_rate: number | null
          height_cm: number | null
          id: string
          notes: string | null
          oxygen_saturation: number | null
          pain_level: number | null
          patient_id: string
          respiratory_rate: number | null
          systolic_bp: number | null
          temperature_c: number | null
          visit_id: string
          weight_kg: number | null
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          diastolic_bp?: number | null
          glucose_mg_dl?: number | null
          heart_rate?: number | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          oxygen_saturation?: number | null
          pain_level?: number | null
          patient_id: string
          respiratory_rate?: number | null
          systolic_bp?: number | null
          temperature_c?: number | null
          visit_id: string
          weight_kg?: number | null
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          created_at?: string
          diastolic_bp?: number | null
          glucose_mg_dl?: number | null
          heart_rate?: number | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          oxygen_saturation?: number | null
          pain_level?: number | null
          patient_id?: string
          respiratory_rate?: number | null
          systolic_bp?: number | null
          temperature_c?: number | null
          visit_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      writeoffs: {
        Row: {
          approved_by: string | null
          batch_id: string
          created_at: string
          id: string
          qty: number
          reason: string
        }
        Insert: {
          approved_by?: string | null
          batch_id: string
          created_at?: string
          id?: string
          qty: number
          reason: string
        }
        Update: {
          approved_by?: string | null
          batch_id?: string
          created_at?: string
          id?: string
          qty?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "writeoffs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_invoice_line: {
        Args: {
          _desc: string
          _kind: string
          _qty: number
          _ref_id: string
          _ref_table: string
          _unit: number
          _visit: string
        }
        Returns: undefined
      }
      can_discharge: { Args: { _visit: string }; Returns: boolean }
      catalog_price: { Args: { _category: string }; Returns: number }
      ensure_open_invoice: { Args: { _visit: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_thread_participant: {
        Args: { _thread: string; _user: string }
        Returns: boolean
      }
      list_messageable_users: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      notify_role: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _link: string
          _role: Database["public"]["Enums"]["app_role"]
          _title: string
          _type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "doctor"
        | "coach"
        | "nurse"
        | "patient"
        | "athlete"
        | "lab_tech"
        | "pharmacist"
        | "radiologist"
        | "receptionist"
        | "cashier"
        | "insurance_officer"
        | "physio"
        | "nutritionist"
        | "team_manager"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "admin",
        "doctor",
        "coach",
        "nurse",
        "patient",
        "athlete",
        "lab_tech",
        "pharmacist",
        "radiologist",
        "receptionist",
        "cashier",
        "insurance_officer",
        "physio",
        "nutritionist",
        "team_manager",
      ],
    },
  },
} as const
