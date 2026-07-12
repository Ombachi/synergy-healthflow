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
      abp_alerts: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          marker: string | null
          message: string
          resolved: boolean | null
          severity: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          marker?: string | null
          message: string
          resolved?: boolean | null
          severity?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          marker?: string | null
          message?: string
          resolved?: boolean | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "abp_alerts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      abp_biomarkers: {
        Row: {
          athlete_id: string
          created_at: string
          flag: string | null
          id: string
          marker: string
          measured_at: string
          reference_high: number | null
          reference_low: number | null
          sample_id: string
          units: string | null
          value: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          flag?: string | null
          id?: string
          marker: string
          measured_at?: string
          reference_high?: number | null
          reference_low?: number | null
          sample_id: string
          units?: string | null
          value: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          flag?: string | null
          id?: string
          marker?: string
          measured_at?: string
          reference_high?: number | null
          reference_low?: number | null
          sample_id?: string
          units?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "abp_biomarkers_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abp_biomarkers_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "abp_samples"
            referencedColumns: ["id"]
          },
        ]
      }
      abp_samples: {
        Row: {
          athlete_id: string
          collected_at: string
          collection_site: string | null
          created_at: string
          created_by: string | null
          id: string
          in_competition: boolean | null
          lab_reference: string | null
          notes: string | null
          sample_type: string
        }
        Insert: {
          athlete_id: string
          collected_at?: string
          collection_site?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          in_competition?: boolean | null
          lab_reference?: string | null
          notes?: string | null
          sample_type: string
        }
        Update: {
          athlete_id?: string
          collected_at?: string
          collection_site?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          in_competition?: boolean | null
          lab_reference?: string | null
          notes?: string | null
          sample_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "abp_samples_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      access_review_items: {
        Row: {
          decision: string
          id: string
          notes: string | null
          review_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          decision?: string
          id?: string
          notes?: string | null
          review_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          decision?: string
          id?: string
          notes?: string | null
          review_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "access_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      access_reviews: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          period_label: string
          quarter: number
          status: string
          year: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          period_label: string
          quarter: number
          status?: string
          year: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          period_label?: string
          quarter?: number
          status?: string
          year?: number
        }
        Relationships: []
      }
      admission_requests: {
        Row: {
          acuity: string | null
          admission_id: string | null
          created_at: string
          id: string
          isolation_required: boolean
          notes: string | null
          patient_id: string
          preferred_ward_id: string | null
          reason: string
          requested_bed_type: string
          requested_by: string | null
          requesting_consultant: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acuity?: string | null
          admission_id?: string | null
          created_at?: string
          id?: string
          isolation_required?: boolean
          notes?: string | null
          patient_id: string
          preferred_ward_id?: string | null
          reason: string
          requested_bed_type?: string
          requested_by?: string | null
          requesting_consultant?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acuity?: string | null
          admission_id?: string | null
          created_at?: string
          id?: string
          isolation_required?: boolean
          notes?: string | null
          patient_id?: string
          preferred_ward_id?: string | null
          reason?: string
          requested_bed_type?: string
          requested_by?: string | null
          requesting_consultant?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_requests_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_requests_preferred_ward_id_fkey"
            columns: ["preferred_ward_id"]
            isOneToOne: false
            referencedRelation: "mv_kpi_occupancy"
            referencedColumns: ["ward_id"]
          },
          {
            foreignKeyName: "admission_requests_preferred_ward_id_fkey"
            columns: ["preferred_ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      admissions: {
        Row: {
          acuity: string | null
          admission_reason: string | null
          admitted_at: string
          admitted_by: string | null
          admitting_consultant: string | null
          bed_id: string | null
          created_at: string
          discharged_at: string | null
          discharged_by: string | null
          expected_discharge_date: string | null
          id: string
          isolation_required: boolean
          patient_id: string
          primary_diagnosis: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          acuity?: string | null
          admission_reason?: string | null
          admitted_at?: string
          admitted_by?: string | null
          admitting_consultant?: string | null
          bed_id?: string | null
          created_at?: string
          discharged_at?: string | null
          discharged_by?: string | null
          expected_discharge_date?: string | null
          id?: string
          isolation_required?: boolean
          patient_id: string
          primary_diagnosis?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          acuity?: string | null
          admission_reason?: string | null
          admitted_at?: string
          admitted_by?: string | null
          admitting_consultant?: string | null
          bed_id?: string | null
          created_at?: string
          discharged_at?: string | null
          discharged_by?: string | null
          expected_discharge_date?: string | null
          id?: string
          isolation_required?: boolean
          patient_id?: string
          primary_diagnosis?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admissions_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      allied_health_notes: {
        Row: {
          admission_id: string
          assessment: string | null
          clinician_id: string | null
          created_at: string
          discipline: string
          encounter_id: string | null
          encounter_type: string | null
          id: string
          intervention: string | null
          plan: string | null
          session_at: string
        }
        Insert: {
          admission_id: string
          assessment?: string | null
          clinician_id?: string | null
          created_at?: string
          discipline: string
          encounter_id?: string | null
          encounter_type?: string | null
          id?: string
          intervention?: string | null
          plan?: string | null
          session_at?: string
        }
        Update: {
          admission_id?: string
          assessment?: string | null
          clinician_id?: string | null
          created_at?: string
          discipline?: string
          encounter_id?: string | null
          encounter_type?: string | null
          id?: string
          intervention?: string | null
          plan?: string | null
          session_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allied_health_notes_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          audience_role: Database["public"]["Enums"]["app_role"] | null
          body: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          pinned: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          audience_role?: Database["public"]["Enums"]["app_role"] | null
          body: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          audience_role?: Database["public"]["Enums"]["app_role"] | null
          body?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      assessment_responses: {
        Row: {
          alert: boolean | null
          answers: Json
          created_at: string
          id: string
          notes: string | null
          patient_id: string | null
          score: number | null
          severity: string | null
          template_code: string
          user_id: string
        }
        Insert: {
          alert?: boolean | null
          answers?: Json
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          score?: number | null
          severity?: string | null
          template_code: string
          user_id: string
        }
        Update: {
          alert?: boolean | null
          answers?: Json
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          score?: number | null
          severity?: string | null
          template_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_responses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_responses_template_code_fkey"
            columns: ["template_code"]
            isOneToOne: false
            referencedRelation: "assessment_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      assessment_templates: {
        Row: {
          active: boolean | null
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          questions: Json
          scoring: Json
        }
        Insert: {
          active?: boolean | null
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          questions?: Json
          scoring?: Json
        }
        Update: {
          active?: boolean | null
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          questions?: Json
          scoring?: Json
        }
        Relationships: []
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
          clock_in: string | null
          clock_out: string | null
          department: string | null
          id: string
          notes: string | null
          recorded_at: string
          recorded_by: string | null
          session_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          athlete_id: string
          clock_in?: string | null
          clock_out?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          session_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          athlete_id?: string
          clock_in?: string | null
          clock_out?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string
          status?: string
          user_id?: string | null
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
      bed_transfers: {
        Row: {
          admission_id: string
          created_at: string
          from_bed_id: string | null
          id: string
          reason: string | null
          to_bed_id: string
          transferred_at: string
          transferred_by: string | null
        }
        Insert: {
          admission_id: string
          created_at?: string
          from_bed_id?: string | null
          id?: string
          reason?: string | null
          to_bed_id: string
          transferred_at?: string
          transferred_by?: string | null
        }
        Update: {
          admission_id?: string
          created_at?: string
          from_bed_id?: string | null
          id?: string
          reason?: string | null
          to_bed_id?: string
          transferred_at?: string
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bed_transfers_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_transfers_from_bed_id_fkey"
            columns: ["from_bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_transfers_to_bed_id_fkey"
            columns: ["to_bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
        ]
      }
      beds: {
        Row: {
          bed_type: string
          code: string
          created_at: string
          id: string
          is_isolation: boolean
          notes: string | null
          status: string
          updated_at: string
          ward_id: string
        }
        Insert: {
          bed_type?: string
          code: string
          created_at?: string
          id?: string
          is_isolation?: boolean
          notes?: string | null
          status?: string
          updated_at?: string
          ward_id: string
        }
        Update: {
          bed_type?: string
          code?: string
          created_at?: string
          id?: string
          is_isolation?: boolean
          notes?: string | null
          status?: string
          updated_at?: string
          ward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "mv_kpi_occupancy"
            referencedColumns: ["ward_id"]
          },
          {
            foreignKeyName: "beds_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      breach_incident_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          incident_id: string
          note: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          incident_id: string
          note?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          incident_id?: string
          note?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "breach_incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "breach_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      breach_incidents: {
        Row: {
          affected_patient_count: number | null
          closed_at: string | null
          created_at: string
          description: string
          discovered_at: string
          dpa_reference: string | null
          id: string
          notification_channel: string | null
          notified_at: string | null
          remediation: string | null
          reported_by: string | null
          root_cause: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_patient_count?: number | null
          closed_at?: string | null
          created_at?: string
          description: string
          discovered_at?: string
          dpa_reference?: string | null
          id?: string
          notification_channel?: string | null
          notified_at?: string | null
          remediation?: string | null
          reported_by?: string | null
          root_cause?: string | null
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_patient_count?: number | null
          closed_at?: string | null
          created_at?: string
          description?: string
          discovered_at?: string
          dpa_reference?: string | null
          id?: string
          notification_channel?: string | null
          notified_at?: string | null
          remediation?: string | null
          reported_by?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      care_plan_goals: {
        Row: {
          care_plan_id: string
          created_at: string
          goal: string
          id: string
          intervention: string | null
          status: string
          target_date: string | null
        }
        Insert: {
          care_plan_id: string
          created_at?: string
          goal: string
          id?: string
          intervention?: string | null
          status?: string
          target_date?: string | null
        }
        Update: {
          care_plan_id?: string
          created_at?: string
          goal?: string
          id?: string
          intervention?: string | null
          status?: string
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_plan_goals_care_plan_id_fkey"
            columns: ["care_plan_id"]
            isOneToOne: false
            referencedRelation: "care_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plans: {
        Row: {
          admission_id: string
          created_at: string
          created_by: string | null
          id: string
          plan_type: string
          problem: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admission_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          plan_type: string
          problem?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admission_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          plan_type?: string
          problem?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_plans_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          cashier_id: string
          closed_at: string | null
          created_at: string
          declared_cash_cents: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_float_cents: number
          status: string
          system_cash_cents: number | null
          variance_cents: number | null
        }
        Insert: {
          cashier_id: string
          closed_at?: string | null
          created_at?: string
          declared_cash_cents?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_float_cents?: number
          status?: string
          system_cash_cents?: number | null
          variance_cents?: number | null
        }
        Update: {
          cashier_id?: string
          closed_at?: string | null
          created_at?: string
          declared_cash_cents?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_float_cents?: number
          status?: string
          system_cash_cents?: number | null
          variance_cents?: number | null
        }
        Relationships: []
      }
      claim_lines: {
        Row: {
          approved_cents: number | null
          billed_cents: number
          claim_id: string
          created_at: string
          description: string
          id: string
          invoice_item_id: string | null
          rejection_reason: string | null
        }
        Insert: {
          approved_cents?: number | null
          billed_cents?: number
          claim_id: string
          created_at?: string
          description: string
          id?: string
          invoice_item_id?: string | null
          rejection_reason?: string | null
        }
        Update: {
          approved_cents?: number | null
          billed_cents?: number
          claim_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_item_id?: string | null
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_lines_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_lines_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_submissions: {
        Row: {
          claim_id: string
          created_at: string
          external_ref: string | null
          id: string
          last_event_at: string
          payer_code: string | null
          raw: Json | null
          status: string
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          external_ref?: string | null
          id?: string
          last_event_at?: string
          payer_code?: string | null
          raw?: Json | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          last_event_at?: string
          payer_code?: string | null
          raw?: Json | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_submissions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
            referencedColumns: ["id"]
          },
        ]
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
      clinical_tasks: {
        Row: {
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          encounter_id: string | null
          encounter_type: string | null
          id: string
          kind: string
          patient_id: string | null
          priority: number
          source_id: string | null
          source_table: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          encounter_id?: string | null
          encounter_type?: string | null
          id?: string
          kind: string
          patient_id?: string | null
          priority?: number
          source_id?: string | null
          source_table?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          encounter_id?: string | null
          encounter_type?: string | null
          id?: string
          kind?: string
          patient_id?: string | null
          priority?: number
          source_id?: string | null
          source_table?: string | null
          status?: string
          title?: string
          updated_at?: string
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
        Relationships: []
      }
      consent_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          signature_hash: string | null
          template_code: string
          template_id: string
          template_version: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          signature_hash?: string | null
          template_code: string
          template_id: string
          template_version: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          signature_hash?: string | null
          template_code?: string
          template_id?: string
          template_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "consent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_templates: {
        Row: {
          active: boolean
          body: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          body: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          body?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          version?: number
        }
        Relationships: []
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
      controlled_drug_register: {
        Row: {
          balance_after: number | null
          created_at: string
          direction: string
          dispenser_id: string | null
          drug_name: string
          id: string
          notes: string | null
          patient_id: string | null
          prescriber_id: string | null
          qty: number
          ref_id: string | null
          ref_table: string | null
          schedule: string
          units: string | null
          witness_id: string | null
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          direction: string
          dispenser_id?: string | null
          drug_name: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          prescriber_id?: string | null
          qty: number
          ref_id?: string | null
          ref_table?: string | null
          schedule: string
          units?: string | null
          witness_id?: string | null
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          direction?: string
          dispenser_id?: string | null
          drug_name?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          prescriber_id?: string | null
          qty?: number
          ref_id?: string | null
          ref_table?: string | null
          schedule?: string
          units?: string | null
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "controlled_drug_register_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          id: string
          invoice_id: string
          patient_id: string
          reason: string
          refund_method: string | null
          refund_reference: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by: string
          id?: string
          invoice_id: string
          patient_id: string
          reason: string
          refund_method?: string | null
          refund_reference?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          id?: string
          invoice_id?: string
          patient_id?: string
          reason?: string
          refund_method?: string | null
          refund_reference?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      discharge_summaries: {
        Row: {
          admission_id: string | null
          clearance_status: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          discharge_medications: string | null
          discharged_at: string | null
          discharged_by: string | null
          finalized: boolean
          finalized_at: string | null
          finalized_by: string | null
          follow_up: string | null
          hospital_course: string | null
          id: string
          invoice_id: string | null
          patient_id: string | null
          preauth_id: string | null
          source_data: Json | null
          summary: string
          treatment_plan: string | null
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          admission_id?: string | null
          clearance_status?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          discharge_medications?: string | null
          discharged_at?: string | null
          discharged_by?: string | null
          finalized?: boolean
          finalized_at?: string | null
          finalized_by?: string | null
          follow_up?: string | null
          hospital_course?: string | null
          id?: string
          invoice_id?: string | null
          patient_id?: string | null
          preauth_id?: string | null
          source_data?: Json | null
          summary: string
          treatment_plan?: string | null
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          admission_id?: string | null
          clearance_status?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          discharge_medications?: string | null
          discharged_at?: string | null
          discharged_by?: string | null
          finalized?: boolean
          finalized_at?: string | null
          finalized_by?: string | null
          follow_up?: string | null
          hospital_course?: string | null
          id?: string
          invoice_id?: string | null
          patient_id?: string | null
          preauth_id?: string | null
          source_data?: Json | null
          summary?: string
          treatment_plan?: string | null
          updated_at?: string
          visit_id?: string | null
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
      doping_tests: {
        Row: {
          athlete_id: string
          collecting_authority: string | null
          created_at: string
          created_by: string | null
          id: string
          in_competition: boolean | null
          notes: string | null
          result: string | null
          substances_detected: string | null
          test_type: string
          tested_at: string
          wada_code: string | null
        }
        Insert: {
          athlete_id: string
          collecting_authority?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          in_competition?: boolean | null
          notes?: string | null
          result?: string | null
          substances_detected?: string | null
          test_type: string
          tested_at?: string
          wada_code?: string | null
        }
        Update: {
          athlete_id?: string
          collecting_authority?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          in_competition?: boolean | null
          notes?: string | null
          result?: string | null
          substances_detected?: string | null
          test_type?: string
          tested_at?: string
          wada_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doping_tests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_catalog: {
        Row: {
          active: boolean
          contraindications: string | null
          controlled_schedule: string | null
          created_at: string
          default_dose: string | null
          default_duration: string | null
          default_frequency: string | null
          drug_name: string
          id: string
          instructions: string | null
          medication_class: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contraindications?: string | null
          controlled_schedule?: string | null
          created_at?: string
          default_dose?: string | null
          default_duration?: string | null
          default_frequency?: string | null
          drug_name: string
          id?: string
          instructions?: string | null
          medication_class?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contraindications?: string | null
          controlled_schedule?: string | null
          created_at?: string
          default_dose?: string | null
          default_duration?: string | null
          default_frequency?: string | null
          drug_name?: string
          id?: string
          instructions?: string | null
          medication_class?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          created_at: string
          employee_id: string
          file_path: string
          id: string
          kind: string
          name: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          file_path: string
          id?: string
          kind: string
          name: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          file_path?: string
          id?: string
          kind?: string
          name?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_name: string | null
          contract_type: string | null
          created_at: string
          date_hired: string | null
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_no: string | null
          employment_status: string
          full_name: string
          gender: string | null
          id: string
          job_grade: string | null
          licenses: string | null
          national_id: string | null
          payment_method: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          professional_memberships: string | null
          qualifications: string | null
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          contract_type?: string | null
          created_at?: string
          date_hired?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_no?: string | null
          employment_status?: string
          full_name: string
          gender?: string | null
          id: string
          job_grade?: string | null
          licenses?: string | null
          national_id?: string | null
          payment_method?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          professional_memberships?: string | null
          qualifications?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          contract_type?: string | null
          created_at?: string
          date_hired?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_no?: string | null
          employment_status?: string
          full_name?: string
          gender?: string | null
          id?: string
          job_grade?: string | null
          licenses?: string | null
          national_id?: string | null
          payment_method?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          professional_memberships?: string | null
          qualifications?: string | null
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      error_events: {
        Row: {
          context: Json | null
          env: string
          id: string
          message: string
          occurred_at: string
          route: string | null
          stack: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          env?: string
          id?: string
          message: string
          occurred_at?: string
          route?: string | null
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          env?: string
          id?: string
          message?: string
          occurred_at?: string
          route?: string | null
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      fluid_balance_entries: {
        Row: {
          admission_id: string
          created_at: string
          direction: string
          id: string
          notes: string | null
          recorded_at: string
          recorded_by: string | null
          route: string
          volume_ml: number
        }
        Insert: {
          admission_id: string
          created_at?: string
          direction: string
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          route: string
          volume_ml: number
        }
        Update: {
          admission_id?: string
          created_at?: string
          direction?: string
          id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          route?: string
          volume_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "fluid_balance_entries_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
        ]
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
      hr_departments: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_document_acks: {
        Row: {
          acknowledged_at: string
          document_id: string
          employee_id: string
          id: string
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          employee_id: string
          id?: string
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_acks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_acks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          expires_at: string | null
          file_path: string | null
          id: string
          published: boolean
          requires_ack: boolean
          title: string
          updated_at: string
          uploaded_by: string | null
          version: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          file_path?: string | null
          id?: string
          published?: boolean
          requires_ack?: boolean
          title: string
          updated_at?: string
          uploaded_by?: string | null
          version?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          file_path?: string | null
          id?: string
          published?: boolean
          requires_ack?: boolean
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: string
        }
        Relationships: []
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
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
      infection_control_alerts: {
        Row: {
          admission_id: string
          created_at: string
          created_by: string | null
          id: string
          is_hospital_acquired: boolean
          notes: string | null
          onset_date: string | null
          organism: string | null
          precaution_type: string
          status: string
        }
        Insert: {
          admission_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_hospital_acquired?: boolean
          notes?: string | null
          onset_date?: string | null
          organism?: string | null
          precaution_type: string
          status?: string
        }
        Update: {
          admission_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_hospital_acquired?: boolean
          notes?: string | null
          onset_date?: string | null
          organism?: string | null
          precaution_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "infection_control_alerts_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
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
      inpatient_procedures: {
        Row: {
          admission_id: string
          complications: string | null
          consent_obtained: boolean
          created_at: string
          id: string
          location: string | null
          notes: string | null
          performed_at: string | null
          performed_by: string | null
          procedure_name: string
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admission_id: string
          complications?: string | null
          consent_obtained?: boolean
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          performed_at?: string | null
          performed_by?: string | null
          procedure_name: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admission_id?: string
          complications?: string | null
          consent_obtained?: boolean
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          performed_at?: string | null
          performed_by?: string | null
          procedure_name?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inpatient_procedures_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
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
      insurance_payers: {
        Row: {
          active: boolean
          category: string | null
          claims_portal_url: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          requires_preauth: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          claims_portal_url?: string | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          requires_preauth?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          claims_portal_url?: string | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          requires_preauth?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      insurance_policies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          insurer: string
          member_number: string
          patient_id: string
          payer_id: string | null
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
          payer_id?: string | null
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
          payer_id?: string | null
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
          {
            foreignKeyName: "insurance_policies_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "insurance_payers"
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
      internal_requests: {
        Row: {
          assignee_id: string | null
          category: Database["public"]["Enums"]["internal_request_category"]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          description: string | null
          id: string
          metadata: Json
          priority: string
          requester_id: string
          status: Database["public"]["Enums"]["internal_request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category: Database["public"]["Enums"]["internal_request_category"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          priority?: string
          requester_id: string
          status?: Database["public"]["Enums"]["internal_request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["internal_request_category"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          priority?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["internal_request_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
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
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
      lab_result_templates: {
        Row: {
          created_at: string
          critical_high: number | null
          critical_low: number | null
          display_order: number
          id: string
          input_type: string
          parameter_name: string
          reference_high: number | null
          reference_low: number | null
          reference_range: string | null
          select_options: string | null
          test_id: string
          units: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          critical_high?: number | null
          critical_low?: number | null
          display_order?: number
          id?: string
          input_type?: string
          parameter_name: string
          reference_high?: number | null
          reference_low?: number | null
          reference_range?: string | null
          select_options?: string | null
          test_id: string
          units?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          critical_high?: number | null
          critical_low?: number | null
          display_order?: number
          id?: string
          input_type?: string
          parameter_name?: string
          reference_high?: number | null
          reference_low?: number | null
          reference_range?: string | null
          select_options?: string | null
          test_id?: string
          units?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_result_templates_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_result_values: {
        Row: {
          abnormal_flag: string | null
          created_at: string
          id: string
          order_id: string
          parameter_name: string
          performed_at: string
          performed_by: string | null
          reference_range: string | null
          template_id: string | null
          units: string | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          abnormal_flag?: string | null
          created_at?: string
          id?: string
          order_id: string
          parameter_name: string
          performed_at?: string
          performed_by?: string | null
          reference_range?: string | null
          template_id?: string | null
          units?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          abnormal_flag?: string | null
          created_at?: string
          id?: string
          order_id?: string
          parameter_name?: string
          performed_at?: string
          performed_by?: string | null
          reference_range?: string | null
          template_id?: string | null
          units?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_result_values_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_result_values_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_lab_tat"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "lab_result_values_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "lab_result_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          abnormal_flag: string | null
          comments: string | null
          created_at: string
          encounter_id: string | null
          encounter_type: string | null
          file_path: string | null
          id: string
          numeric_value: number | null
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
          encounter_id?: string | null
          encounter_type?: string | null
          file_path?: string | null
          id?: string
          numeric_value?: number | null
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
          encounter_id?: string | null
          encounter_type?: string | null
          file_path?: string | null
          id?: string
          numeric_value?: number | null
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
          {
            foreignKeyName: "lab_results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_lab_tat"
            referencedColumns: ["order_id"]
          },
        ]
      }
      lab_samples: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          condition: string | null
          created_at: string
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          {
            foreignKeyName: "lab_samples_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_lab_tat"
            referencedColumns: ["order_id"]
          },
        ]
      }
      lab_tests_catalog: {
        Row: {
          category: string | null
          code: string
          container: string | null
          created_at: string
          critical_high: number | null
          critical_low: number | null
          id: string
          name: string
          price: number | null
          reference_high: number | null
          reference_low: number | null
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
          critical_high?: number | null
          critical_low?: number | null
          id?: string
          name: string
          price?: number | null
          reference_high?: number | null
          reference_low?: number | null
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
          critical_high?: number | null
          critical_low?: number | null
          id?: string
          name?: string
          price?: number | null
          reference_high?: number | null
          reference_low?: number | null
          reference_range?: string | null
          specimen?: string | null
          turnaround_hours?: number | null
          units?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          balance_days: number
          created_at: string
          employee_id: string
          id: string
          leave_type_id: string
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          balance_days?: number
          created_at?: string
          employee_id: string
          id?: string
          leave_type_id: string
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          balance_days?: number
          created_at?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approver_comment: string | null
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          employee_id: string
          end_date: string
          hr_decision_at: string | null
          hr_id: string | null
          hr_notes: string | null
          id: string
          leave_type_id: string
          reason: string | null
          start_date: string
          status: string
          supervisor_decision_at: string | null
          supervisor_id: string | null
          supervisor_notes: string | null
          supporting_doc_url: string | null
          updated_at: string
        }
        Insert: {
          approver_comment?: string | null
          created_at?: string
          days: number
          decided_at?: string | null
          decided_by?: string | null
          employee_id: string
          end_date: string
          hr_decision_at?: string | null
          hr_id?: string | null
          hr_notes?: string | null
          id?: string
          leave_type_id: string
          reason?: string | null
          start_date: string
          status?: string
          supervisor_decision_at?: string | null
          supervisor_id?: string | null
          supervisor_notes?: string | null
          supporting_doc_url?: string | null
          updated_at?: string
        }
        Update: {
          approver_comment?: string | null
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string
          end_date?: string
          hr_decision_at?: string | null
          hr_id?: string | null
          hr_notes?: string | null
          id?: string
          leave_type_id?: string
          reason?: string | null
          start_date?: string
          status?: string
          supervisor_decision_at?: string | null
          supervisor_id?: string | null
          supervisor_notes?: string | null
          supporting_doc_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          code: string
          created_at: string
          default_days_per_year: number
          id: string
          name: string
          paid: boolean
        }
        Insert: {
          code: string
          created_at?: string
          default_days_per_year?: number
          id?: string
          name: string
          paid?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          default_days_per_year?: number
          id?: string
          name?: string
          paid?: boolean
        }
        Relationships: []
      }
      mar_administrations: {
        Row: {
          administered_at: string
          administered_by: string | null
          created_at: string
          dose_given: string | null
          id: string
          medication_order_id: string
          notes: string | null
          reason_not_given: string | null
          status: string
          witness_id: string | null
        }
        Insert: {
          administered_at?: string
          administered_by?: string | null
          created_at?: string
          dose_given?: string | null
          id?: string
          medication_order_id: string
          notes?: string | null
          reason_not_given?: string | null
          status?: string
          witness_id?: string | null
        }
        Update: {
          administered_at?: string
          administered_by?: string | null
          created_at?: string
          dose_given?: string | null
          id?: string
          medication_order_id?: string
          notes?: string | null
          reason_not_given?: string | null
          status?: string
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mar_administrations_medication_order_id_fkey"
            columns: ["medication_order_id"]
            isOneToOne: false
            referencedRelation: "medication_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_orders: {
        Row: {
          admission_id: string
          created_at: string
          dose: string
          encounter_id: string | null
          encounter_type: string | null
          frequency: string
          id: string
          indication: string | null
          medication: string
          prescribed_by: string | null
          prn: boolean
          route: string
          start_at: string
          status: string
          stop_at: string | null
          updated_at: string
        }
        Insert: {
          admission_id: string
          created_at?: string
          dose: string
          encounter_id?: string | null
          encounter_type?: string | null
          frequency: string
          id?: string
          indication?: string | null
          medication: string
          prescribed_by?: string | null
          prn?: boolean
          route: string
          start_at?: string
          status?: string
          stop_at?: string | null
          updated_at?: string
        }
        Update: {
          admission_id?: string
          created_at?: string
          dose?: string
          encounter_id?: string | null
          encounter_type?: string | null
          frequency?: string
          id?: string
          indication?: string | null
          medication?: string
          prescribed_by?: string | null
          prn?: boolean
          route?: string
          start_at?: string
          status?: string
          stop_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_orders_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
        ]
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
      notification_preferences: {
        Row: {
          email_address: string | null
          email_enabled: boolean
          mute_categories: string[]
          phone_number: string | null
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_address?: string | null
          email_enabled?: boolean
          mute_categories?: string[]
          phone_number?: string | null
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_address?: string | null
          email_enabled?: boolean
          mute_categories?: string[]
          phone_number?: string | null
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
      outbox_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: []
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
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
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
      payroll_periods: {
        Row: {
          created_at: string
          id: string
          label: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payslip_lines: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          kind: string
          label: string
          payslip_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind: string
          label: string
          payslip_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          payslip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslip_lines_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          allowances_cents: number
          basic_cents: number
          created_at: string
          employee_id: string
          housing_levy_cents: number
          id: string
          net_cents: number
          nhif_cents: number
          notes: string | null
          nssf_cents: number
          other_deductions_cents: number
          overtime_cents: number
          paye_cents: number
          period_id: string
          published: boolean
          updated_at: string
        }
        Insert: {
          allowances_cents?: number
          basic_cents?: number
          created_at?: string
          employee_id: string
          housing_levy_cents?: number
          id?: string
          net_cents?: number
          nhif_cents?: number
          notes?: string | null
          nssf_cents?: number
          other_deductions_cents?: number
          overtime_cents?: number
          paye_cents?: number
          period_id: string
          published?: boolean
          updated_at?: string
        }
        Update: {
          allowances_cents?: number
          basic_cents?: number
          created_at?: string
          employee_id?: string
          housing_levy_cents?: number
          id?: string
          net_cents?: number
          nhif_cents?: number
          notes?: string | null
          nssf_cents?: number
          other_deductions_cents?: number
          overtime_cents?: number
          paye_cents?: number
          period_id?: string
          published?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
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
      preauth_requests: {
        Row: {
          approved_amount_cents: number | null
          clinical_justification: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          estimated_cost_cents: number | null
          expires_at: string | null
          id: string
          patient_id: string
          payer_id: string | null
          policy_id: string | null
          procedure_code: string | null
          procedure_name: string
          reference_number: string | null
          requested_by: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          approved_amount_cents?: number | null
          clinical_justification?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          estimated_cost_cents?: number | null
          expires_at?: string | null
          id?: string
          patient_id: string
          payer_id?: string | null
          policy_id?: string | null
          procedure_code?: string | null
          procedure_name: string
          reference_number?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          approved_amount_cents?: number | null
          clinical_justification?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          estimated_cost_cents?: number | null
          expires_at?: string | null
          id?: string
          patient_id?: string
          payer_id?: string | null
          policy_id?: string | null
          procedure_code?: string | null
          procedure_name?: string
          reference_number?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preauth_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preauth_requests_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "insurance_payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preauth_requests_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preauth_requests_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
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
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id: string | null
          encounter_type: string | null
          id: string
          notes: string | null
          ordered_by: string | null
          performed_at: string | null
          performed_by: string | null
          preauth_id: string | null
          procedure_name: string
          requires_preauth: boolean
          status: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          encounter_id?: string | null
          encounter_type?: string | null
          id?: string
          notes?: string | null
          ordered_by?: string | null
          performed_at?: string | null
          performed_by?: string | null
          preauth_id?: string | null
          procedure_name: string
          requires_preauth?: boolean
          status?: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          encounter_id?: string | null
          encounter_type?: string | null
          id?: string
          notes?: string | null
          ordered_by?: string | null
          performed_at?: string | null
          performed_by?: string | null
          preauth_id?: string | null
          procedure_name?: string
          requires_preauth?: boolean
          status?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_orders_preauth_fk"
            columns: ["preauth_id"]
            isOneToOne: false
            referencedRelation: "preauth_requests"
            referencedColumns: ["id"]
          },
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
      quality_events: {
        Row: {
          actions_taken: string | null
          admission_id: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          occurred_at: string
          patient_id: string | null
          reported_by: string | null
          severity: string
        }
        Insert: {
          actions_taken?: string | null
          admission_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          patient_id?: string | null
          reported_by?: string | null
          severity?: string
        }
        Update: {
          actions_taken?: string | null
          admission_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          patient_id?: string | null
          reported_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_events_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
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
      remittance_batches: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          imported_by: string | null
          payer_code: string | null
          payer_id: string | null
          rows_matched: number
          rows_total: number
          rows_unmatched: number
          total_paid_cents: number
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          imported_by?: string | null
          payer_code?: string | null
          payer_id?: string | null
          rows_matched?: number
          rows_total?: number
          rows_unmatched?: number
          total_paid_cents?: number
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          imported_by?: string | null
          payer_code?: string | null
          payer_id?: string | null
          rows_matched?: number
          rows_total?: number
          rows_unmatched?: number
          total_paid_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "remittance_batches_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "insurance_payers"
            referencedColumns: ["id"]
          },
        ]
      }
      remittance_lines: {
        Row: {
          approved_cents: number | null
          batch_id: string
          claim_id: string | null
          created_at: string
          external_claim_ref: string | null
          id: string
          invoice_no: string | null
          matched: boolean
          member_number: string | null
          paid_at: string | null
          paid_cents: number
          reason: string | null
          status: string | null
        }
        Insert: {
          approved_cents?: number | null
          batch_id: string
          claim_id?: string | null
          created_at?: string
          external_claim_ref?: string | null
          id?: string
          invoice_no?: string | null
          matched?: boolean
          member_number?: string | null
          paid_at?: string | null
          paid_cents?: number
          reason?: string | null
          status?: string | null
        }
        Update: {
          approved_cents?: number | null
          batch_id?: string
          claim_id?: string | null
          created_at?: string
          external_claim_ref?: string | null
          id?: string
          invoice_no?: string | null
          matched?: boolean
          member_number?: string | null
          paid_at?: string | null
          paid_cents?: number
          reason?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remittance_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "remittance_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_lines_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
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
      shift_assignments: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          role: string | null
          shift_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          role?: string | null
          shift_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          role?: string | null
          shift_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          ends_at: string
          id: string
          name: string
          notes: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          ends_at: string
          id?: string
          name: string
          notes?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          ends_at?: string
          id?: string
          name?: string
          notes?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sick_off_notes: {
        Row: {
          created_at: string
          days: number
          diagnosis: string | null
          doctor_id: string | null
          end_date: string
          id: string
          patient_id: string
          recommendation: string | null
          start_date: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          days?: number
          diagnosis?: string | null
          doctor_id?: string | null
          end_date?: string
          id?: string
          patient_id: string
          recommendation?: string | null
          start_date?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          days?: number
          diagnosis?: string | null
          doctor_id?: string | null
          end_date?: string
          id?: string
          patient_id?: string
          recommendation?: string | null
          start_date?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sick_off_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sick_off_notes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          signature_hash: string
          signed_at: string
          signer_id: string
          signer_name: string
          signer_role: string | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          signature_hash: string
          signed_at?: string
          signer_id: string
          signer_name: string
          signer_role?: string | null
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          signature_hash?: string
          signed_at?: string
          signer_id?: string
          signer_name?: string
          signer_role?: string | null
        }
        Relationships: []
      }
      sports_physiology: {
        Row: {
          athlete_id: string
          body_fat_pct: number | null
          created_at: string
          grip_strength_kg: number | null
          height_cm: number | null
          hrv_rmssd: number | null
          id: string
          lactate_threshold: number | null
          lean_mass_kg: number | null
          max_hr: number | null
          measured_at: string
          notes: string | null
          recorded_by: string | null
          recovery_score: number | null
          resting_hr: number | null
          sleep_hours: number | null
          vertical_jump_cm: number | null
          vo2_max: number | null
          weight_kg: number | null
          wellness_score: number | null
        }
        Insert: {
          athlete_id: string
          body_fat_pct?: number | null
          created_at?: string
          grip_strength_kg?: number | null
          height_cm?: number | null
          hrv_rmssd?: number | null
          id?: string
          lactate_threshold?: number | null
          lean_mass_kg?: number | null
          max_hr?: number | null
          measured_at?: string
          notes?: string | null
          recorded_by?: string | null
          recovery_score?: number | null
          resting_hr?: number | null
          sleep_hours?: number | null
          vertical_jump_cm?: number | null
          vo2_max?: number | null
          weight_kg?: number | null
          wellness_score?: number | null
        }
        Update: {
          athlete_id?: string
          body_fat_pct?: number | null
          created_at?: string
          grip_strength_kg?: number | null
          height_cm?: number | null
          hrv_rmssd?: number | null
          id?: string
          lactate_threshold?: number | null
          lean_mass_kg?: number | null
          max_hr?: number | null
          measured_at?: string
          notes?: string | null
          recorded_by?: string | null
          recovery_score?: number | null
          resting_hr?: number | null
          sleep_hours?: number | null
          vertical_jump_cm?: number | null
          vo2_max?: number | null
          weight_kg?: number | null
          wellness_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_physiology_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
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
      surgery_bookings: {
        Row: {
          admission_id: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string | null
          procedure_name: string
          scheduled_at: string
          status: string
          surgeon_id: string | null
          theatre: string | null
          updated_at: string
        }
        Insert: {
          admission_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          procedure_name: string
          scheduled_at: string
          status?: string
          surgeon_id?: string | null
          theatre?: string | null
          updated_at?: string
        }
        Update: {
          admission_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          procedure_name?: string
          scheduled_at?: string
          status?: string
          surgeon_id?: string | null
          theatre?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surgery_bookings_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surgery_bookings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_bids: {
        Row: {
          amount_cents: number
          attachment_url: string | null
          bidder_email: string | null
          bidder_id: string
          bidder_name: string
          bidder_phone: string | null
          created_at: string
          delivery_days: number | null
          id: string
          proposal: string | null
          review_notes: string | null
          status: Database["public"]["Enums"]["bid_status"]
          tender_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attachment_url?: string | null
          bidder_email?: string | null
          bidder_id: string
          bidder_name: string
          bidder_phone?: string | null
          created_at?: string
          delivery_days?: number | null
          id?: string
          proposal?: string | null
          review_notes?: string | null
          status?: Database["public"]["Enums"]["bid_status"]
          tender_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attachment_url?: string | null
          bidder_email?: string | null
          bidder_id?: string
          bidder_name?: string
          bidder_phone?: string | null
          created_at?: string
          delivery_days?: number | null
          id?: string
          proposal?: string | null
          review_notes?: string | null
          status?: Database["public"]["Enums"]["bid_status"]
          tender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_bids_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          awarded_bid_id: string | null
          budget_cents: number | null
          category: string | null
          closes_at: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          opens_at: string
          reference: string
          status: Database["public"]["Enums"]["tender_status"]
          title: string
          updated_at: string
        }
        Insert: {
          awarded_bid_id?: string | null
          budget_cents?: number | null
          category?: string | null
          closes_at: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          opens_at?: string
          reference?: string
          status?: Database["public"]["Enums"]["tender_status"]
          title: string
          updated_at?: string
        }
        Update: {
          awarded_bid_id?: string | null
          budget_cents?: number | null
          category?: string | null
          closes_at?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          opens_at?: string
          reference?: string
          status?: Database["public"]["Enums"]["tender_status"]
          title?: string
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
      tue_requests: {
        Row: {
          athlete_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reference: string | null
          diagnosis: string | null
          id: string
          justification: string | null
          requested_by: string | null
          status: string
          substance: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reference?: string | null
          diagnosis?: string | null
          id?: string
          justification?: string | null
          requested_by?: string | null
          status?: string
          substance: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reference?: string | null
          diagnosis?: string | null
          id?: string
          justification?: string | null
          requested_by?: string | null
          status?: string
          substance?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tue_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
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
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          patient_id: string
          payment_location: string | null
          payment_method: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          patient_id: string
          payment_location?: string | null
          payment_method?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          patient_id?: string
          payment_location?: string | null
          payment_method?: string | null
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
          encounter_id: string | null
          encounter_type: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
          encounter_id?: string | null
          encounter_type?: string | null
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
      ward_rounds: {
        Row: {
          admission_id: string
          assessment: string | null
          created_at: string
          id: string
          objective: string | null
          performed_by: string | null
          plan: string | null
          round_at: string
          round_type: string
          subjective: string | null
          updated_at: string
        }
        Insert: {
          admission_id: string
          assessment?: string | null
          created_at?: string
          id?: string
          objective?: string | null
          performed_by?: string | null
          plan?: string | null
          round_at?: string
          round_type?: string
          subjective?: string | null
          updated_at?: string
        }
        Update: {
          admission_id?: string
          assessment?: string | null
          created_at?: string
          id?: string
          objective?: string | null
          performed_by?: string | null
          plan?: string | null
          round_at?: string
          round_type?: string
          subjective?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ward_rounds_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
        ]
      }
      wards: {
        Row: {
          code: string | null
          created_at: string
          department: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      warning_scores: {
        Row: {
          admission_id: string
          components: Json
          created_at: string
          id: string
          notes: string | null
          risk_level: string | null
          scale: string
          scored_at: string
          scored_by: string | null
          total_score: number
        }
        Insert: {
          admission_id: string
          components?: Json
          created_at?: string
          id?: string
          notes?: string | null
          risk_level?: string | null
          scale: string
          scored_at?: string
          scored_by?: string | null
          total_score: number
        }
        Update: {
          admission_id?: string
          components?: Json
          created_at?: string
          id?: string
          notes?: string | null
          risk_level?: string | null
          scale?: string
          scored_at?: string
          scored_by?: string | null
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "warning_scores_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
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
      mv_kpi_alos: {
        Row: {
          alos_days: number | null
          discharges_30d: number | null
        }
        Relationships: []
      }
      mv_kpi_denial: {
        Row: {
          decided_count: number | null
          denial_pct: number | null
          denied_count: number | null
        }
        Relationships: []
      }
      mv_kpi_lab_tat: {
        Row: {
          samples_30d: number | null
          tat_minutes: number | null
        }
        Relationships: []
      }
      mv_kpi_occupancy: {
        Row: {
          blocked: number | null
          cleaning: number | null
          free: number | null
          occupancy_pct: number | null
          occupied: number | null
          total_beds: number | null
          ward: string | null
          ward_id: string | null
        }
        Relationships: []
      }
      mv_kpi_revenue_by_dept: {
        Row: {
          day: string | null
          dept: string | null
          line_count: number | null
          revenue_cents: number | null
        }
        Relationships: []
      }
      v_effective_consent: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string | null
          patient_id: string | null
          template_code: string | null
          template_version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lab_tat: {
        Row: {
          completed_at: string | null
          minutes_elapsed: number | null
          order_id: string | null
          ordered_at: string | null
          patient_id: string | null
          priority: string | null
          sla_status: string | null
          status: string | null
          threshold_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      v_radiology_tat: {
        Row: {
          minutes_elapsed: number | null
          modality: string | null
          order_id: string | null
          ordered_at: string | null
          patient_id: string | null
          performed_at: string | null
          priority: string | null
          reported_at: string | null
          sla_status: string | null
          status: string | null
          threshold_minutes: number | null
        }
        Insert: {
          minutes_elapsed?: never
          modality?: string | null
          order_id?: string | null
          ordered_at?: string | null
          patient_id?: string | null
          performed_at?: string | null
          priority?: string | null
          reported_at?: never
          sla_status?: never
          status?: string | null
          threshold_minutes?: never
        }
        Update: {
          minutes_elapsed?: never
          modality?: string | null
          order_id?: string | null
          ordered_at?: string | null
          patient_id?: string | null
          performed_at?: string | null
          priority?: string | null
          reported_at?: never
          sla_status?: never
          status?: string | null
          threshold_minutes?: never
        }
        Relationships: [
          {
            foreignKeyName: "imaging_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abp_marker_trend: {
        Args: { _athlete: string; _marker: string }
        Returns: {
          first_value: number
          last_value: number
          mean_value: number
          n: number
          pct_change: number
          rolling3: number
          slope_per_day: number
        }[]
      }
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
      admit_patient: {
        Args: { _reason?: string; _visit_id: string; _ward_id: string }
        Returns: {
          admission_id: string
          bed_code: string
          bed_id: string
        }[]
      }
      approve_credit_note: {
        Args: {
          _credit_note_id: string
          _notes?: string
          _refund_method: string
          _refund_reference?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          created_by: string
          id: string
          invoice_id: string
          patient_id: string
          reason: string
          refund_method: string | null
          refund_reference: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      calc_leave_days: {
        Args: { _end: string; _start: string }
        Returns: number
      }
      can_discharge: { Args: { _visit: string }; Returns: boolean }
      catalog_price: { Args: { _category: string }; Returns: number }
      close_cash_session: {
        Args: { _declared_cents: number; _notes?: string; _session_id: string }
        Returns: {
          cashier_id: string
          closed_at: string | null
          created_at: string
          declared_cash_cents: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_float_cents: number
          status: string
          system_cash_cents: number | null
          variance_cents: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_access_review: { Args: { _review: string }; Returns: undefined }
      compute_patient_initials: { Args: { _name: string }; Returns: string }
      cron_sla_breach_scan: { Args: never; Returns: undefined }
      emit_outbox: {
        Args: {
          _agg_id: string
          _agg_type: string
          _event: string
          _payload: Json
        }
        Returns: undefined
      }
      ensure_open_invoice: { Args: { _visit: string }; Returns: string }
      find_duplicate_patients: {
        Args: { _dob: string; _name: string; _phone: string }
        Returns: {
          date_of_birth: string
          full_name: string
          id: string
          medical_record_number: string
          phone: string
          score: number
        }[]
      }
      get_public_queue: {
        Args: never
        Returns: {
          entered_at: string
          priority: number
          queue_type: string
          status: string
          ticket: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hr_staff: { Args: never; Returns: boolean }
      is_supervisor_of: { Args: { _emp: string }; Returns: boolean }
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
      log_error: {
        Args: {
          _context?: Json
          _env?: string
          _message: string
          _route?: string
          _stack?: string
        }
        Returns: string
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
      open_access_review: {
        Args: { _quarter: number; _year: number }
        Returns: string
      }
      refresh_admin_kpis: { Args: never; Returns: undefined }
      reject_credit_note: {
        Args: { _credit_note_id: string; _notes: string }
        Returns: {
          amount_cents: number
          created_at: string
          created_by: string
          id: string
          invoice_id: string
          patient_id: string
          reason: string
          refund_method: string | null
          refund_reference: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_patient: { Args: { _patient: string }; Returns: undefined }
      restore_visit: { Args: { _visit: string }; Returns: undefined }
      roster_conflicts: {
        Args: { _ends: string; _starts: string; _user: string }
        Returns: {
          ends_at: string
          kind: string
          label: string
          ref_id: string
          starts_at: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_patient: {
        Args: { _patient: string; _reason: string }
        Returns: undefined
      }
      soft_delete_visit: {
        Args: { _reason: string; _visit: string }
        Returns: undefined
      }
      verify_prescription: {
        Args: { rx_id: string }
        Returns: {
          exists_flag: boolean
          hash_prefix: string
          signed: boolean
          signed_at: string
          signer_name: string
          signer_role: string
        }[]
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
        | "store_keeper"
        | "procurement"
        | "billing_officer"
        | "hr_officer"
        | "hr_manager"
        | "dept_manager"
        | "admissions_officer"
      bid_status:
        | "submitted"
        | "shortlisted"
        | "rejected"
        | "awarded"
        | "withdrawn"
      internal_request_category:
        | "equipment"
        | "it_support"
        | "hr"
        | "procurement"
        | "maintenance"
      internal_request_status:
        | "submitted"
        | "in_review"
        | "clarification"
        | "approved"
        | "rejected"
        | "fulfilled"
        | "cancelled"
      tender_status: "draft" | "open" | "closed" | "awarded" | "cancelled"
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
        "store_keeper",
        "procurement",
        "billing_officer",
        "hr_officer",
        "hr_manager",
        "dept_manager",
        "admissions_officer",
      ],
      bid_status: [
        "submitted",
        "shortlisted",
        "rejected",
        "awarded",
        "withdrawn",
      ],
      internal_request_category: [
        "equipment",
        "it_support",
        "hr",
        "procurement",
        "maintenance",
      ],
      internal_request_status: [
        "submitted",
        "in_review",
        "clarification",
        "approved",
        "rejected",
        "fulfilled",
        "cancelled",
      ],
      tender_status: ["draft", "open", "closed", "awarded", "cancelled"],
    },
  },
} as const
