export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analysis_runs: {
        Row: {
          completed_at: string | null
          conversation_id: string
          cost_currency: string | null
          cost_minor: number | null
          created_at: string
          domain_pack_version: string
          error_code: string | null
          error_message: string | null
          id: string
          input_tokens: number | null
          latency_milliseconds: number | null
          metric_run_id: string | null
          model: string
          model_version: string | null
          organization_id: string
          output_tokens: number | null
          prompt_version: string
          provenance_metadata: Json
          provider: string
          provider_request_id: string | null
          source_transcription_run_id: string
          speaker_mapping_version_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          taxonomy_version: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          cost_currency?: string | null
          cost_minor?: number | null
          created_at?: string
          domain_pack_version: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_milliseconds?: number | null
          metric_run_id?: string | null
          model: string
          model_version?: string | null
          organization_id: string
          output_tokens?: number | null
          prompt_version: string
          provenance_metadata?: Json
          provider: string
          provider_request_id?: string | null
          source_transcription_run_id: string
          speaker_mapping_version_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          taxonomy_version: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          cost_currency?: string | null
          cost_minor?: number | null
          created_at?: string
          domain_pack_version?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_milliseconds?: number | null
          metric_run_id?: string | null
          model?: string
          model_version?: string | null
          organization_id?: string
          output_tokens?: number | null
          prompt_version?: string
          provenance_metadata?: Json
          provider?: string
          provider_request_id?: string | null
          source_transcription_run_id?: string
          speaker_mapping_version_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          taxonomy_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_mapping_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "source_transcription_run_id",
              "speaker_mapping_version_id",
            ]
            isOneToOne: false
            referencedRelation: "speaker_mapping_versions"
            referencedColumns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "id",
            ]
          },
          {
            foreignKeyName: "analysis_runs_metric_run_fk"
            columns: ["organization_id", "conversation_id", "metric_run_id"]
            isOneToOne: false
            referencedRelation: "metric_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "analysis_runs_transcription_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "source_transcription_run_id",
            ]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      anuma_categories: {
        Row: {
          active: boolean
          description: string
          key: string
          label: string
          sort_order: number
          vertical: string
        }
        Insert: {
          active?: boolean
          description: string
          key: string
          label: string
          sort_order?: number
          vertical?: string
        }
        Update: {
          active?: boolean
          description?: string
          key?: string
          label?: string
          sort_order?: number
          vertical?: string
        }
        Relationships: []
      }
      catalogue_imports: {
        Row: {
          added_count: number
          changed_count: number
          completed_at: string | null
          created_at: string
          delisted_count: number
          error_message: string | null
          filename: string | null
          id: string
          imported_by_membership_id: string | null
          organization_id: string
          row_count: number
          status: string
          unchanged_count: number
        }
        Insert: {
          added_count?: number
          changed_count?: number
          completed_at?: string | null
          created_at?: string
          delisted_count?: number
          error_message?: string | null
          filename?: string | null
          id?: string
          imported_by_membership_id?: string | null
          organization_id: string
          row_count?: number
          status?: string
          unchanged_count?: number
        }
        Update: {
          added_count?: number
          changed_count?: number
          completed_at?: string | null
          created_at?: string
          delisted_count?: number
          error_message?: string | null
          filename?: string | null
          id?: string
          imported_by_membership_id?: string | null
          organization_id?: string
          row_count?: number
          status?: string
          unchanged_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_imports_imported_by_membership_id_fkey"
            columns: ["imported_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_item_attributes: {
        Row: {
          attribute_key: string
          extracted_at: string
          extractor_version: string
          id: string
          item_id: string
          organization_id: string
          unit: string | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          attribute_key: string
          extracted_at?: string
          extractor_version: string
          id?: string
          item_id: string
          organization_id: string
          unit?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          attribute_key?: string
          extracted_at?: string
          extractor_version?: string
          id?: string
          item_id?: string
          organization_id?: string
          unit?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_item_attributes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_items: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          content_hash: string
          created_at: string
          currency_code: string | null
          dept_id: string | null
          dept_name: string | null
          description: string
          first_seen_import: string | null
          group_id: string | null
          group_name: string | null
          id: string
          item_id: string
          last_seen_import: string | null
          msrp_minor: number | null
          organization_id: string
          price_minor: number | null
          spec_colour: string | null
          spec_completeness: number | null
          spec_cpu: string | null
          spec_cpu_family: string | null
          spec_gpu_gb: number | null
          spec_issues: string[]
          spec_parsed_at: string | null
          spec_parser_version: string | null
          spec_ram_gb: number | null
          spec_screen_in: number | null
          spec_storage_gb: number | null
          subgroup_id: string | null
          subgroup_name: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          content_hash: string
          created_at?: string
          currency_code?: string | null
          dept_id?: string | null
          dept_name?: string | null
          description?: string
          first_seen_import?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          item_id: string
          last_seen_import?: string | null
          msrp_minor?: number | null
          organization_id: string
          price_minor?: number | null
          spec_colour?: string | null
          spec_completeness?: number | null
          spec_cpu?: string | null
          spec_cpu_family?: string | null
          spec_gpu_gb?: number | null
          spec_issues?: string[]
          spec_parsed_at?: string | null
          spec_parser_version?: string | null
          spec_ram_gb?: number | null
          spec_screen_in?: number | null
          spec_storage_gb?: number | null
          subgroup_id?: string | null
          subgroup_name?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          content_hash?: string
          created_at?: string
          currency_code?: string | null
          dept_id?: string | null
          dept_name?: string | null
          description?: string
          first_seen_import?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          item_id?: string
          last_seen_import?: string | null
          msrp_minor?: number | null
          organization_id?: string
          price_minor?: number | null
          spec_colour?: string | null
          spec_completeness?: number | null
          spec_cpu?: string | null
          spec_cpu_family?: string | null
          spec_gpu_gb?: number | null
          spec_issues?: string[]
          spec_parsed_at?: string | null
          spec_parser_version?: string | null
          spec_ram_gb?: number | null
          spec_screen_in?: number | null
          spec_storage_gb?: number | null
          subgroup_id?: string | null
          subgroup_name?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_items_first_seen_import_fkey"
            columns: ["first_seen_import"]
            isOneToOne: false
            referencedRelation: "catalogue_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_items_last_seen_import_fkey"
            columns: ["last_seen_import"]
            isOneToOne: false
            referencedRelation: "catalogue_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_source_columns: {
        Row: {
          accepted: boolean
          distinct_values: number | null
          id: string
          inferred_at: string
          null_share: number | null
          organization_id: string
          rejection_reason: string | null
          role: string
          sample_values: string[] | null
          source_column: string
          unit: string | null
          value_kind: string | null
        }
        Insert: {
          accepted?: boolean
          distinct_values?: number | null
          id?: string
          inferred_at?: string
          null_share?: number | null
          organization_id: string
          rejection_reason?: string | null
          role: string
          sample_values?: string[] | null
          source_column: string
          unit?: string | null
          value_kind?: string | null
        }
        Update: {
          accepted?: boolean
          distinct_values?: number | null
          id?: string
          inferred_at?: string
          null_share?: number | null
          organization_id?: string
          rejection_reason?: string | null
          role?: string
          sample_values?: string[] | null
          source_column?: string
          unit?: string | null
          value_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_source_columns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_staging: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          content_hash: string
          currency_code: string | null
          dept_id: string | null
          dept_name: string | null
          description: string
          group_id: string | null
          group_name: string | null
          import_id: string
          item_id: string
          msrp_minor: number | null
          organization_id: string
          price_minor: number | null
          subgroup_id: string | null
          subgroup_name: string | null
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          content_hash: string
          currency_code?: string | null
          dept_id?: string | null
          dept_name?: string | null
          description?: string
          group_id?: string | null
          group_name?: string | null
          import_id: string
          item_id: string
          msrp_minor?: number | null
          organization_id: string
          price_minor?: number | null
          subgroup_id?: string | null
          subgroup_name?: string | null
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          content_hash?: string
          currency_code?: string | null
          dept_id?: string | null
          dept_name?: string | null
          description?: string
          group_id?: string | null
          group_name?: string | null
          import_id?: string
          item_id?: string
          msrp_minor?: number | null
          organization_id?: string
          price_minor?: number | null
          subgroup_id?: string | null
          subgroup_name?: string | null
        }
        Relationships: []
      }
      category_attributes: {
        Row: {
          attribute_key: string
          comparison: string
          coverage: number | null
          discovered_at: string
          distinct_values: number | null
          extractor_version: string
          id: string
          judged_at: string | null
          kind: string
          node_key: string
          organization_id: string
          range_max: number | null
          range_min: number | null
          rejection_reason: string | null
          spread: number | null
          status: string
          unit: string | null
          unit_tokens: string[]
          vocabulary: Json
        }
        Insert: {
          attribute_key: string
          comparison: string
          coverage?: number | null
          discovered_at?: string
          distinct_values?: number | null
          extractor_version: string
          id?: string
          judged_at?: string | null
          kind: string
          node_key: string
          organization_id: string
          range_max?: number | null
          range_min?: number | null
          rejection_reason?: string | null
          spread?: number | null
          status?: string
          unit?: string | null
          unit_tokens?: string[]
          vocabulary?: Json
        }
        Update: {
          attribute_key?: string
          comparison?: string
          coverage?: number | null
          discovered_at?: string
          distinct_values?: number | null
          extractor_version?: string
          id?: string
          judged_at?: string | null
          kind?: string
          node_key?: string
          organization_id?: string
          range_max?: number | null
          range_min?: number | null
          rejection_reason?: string | null
          spread?: number | null
          status?: string
          unit?: string | null
          unit_tokens?: string[]
          vocabulary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "category_attributes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      category_mappings: {
        Row: {
          anuma_category_key: string | null
          confirmed_by_membership_id: string | null
          created_at: string
          group_name: string
          id: string
          item_count: number
          organization_id: string
          proposed_key: string | null
          proposed_margin: number | null
          proposed_score: number | null
          status: string
          subgroup_name: string
          updated_at: string
        }
        Insert: {
          anuma_category_key?: string | null
          confirmed_by_membership_id?: string | null
          created_at?: string
          group_name: string
          id?: string
          item_count?: number
          organization_id: string
          proposed_key?: string | null
          proposed_margin?: number | null
          proposed_score?: number | null
          status?: string
          subgroup_name: string
          updated_at?: string
        }
        Update: {
          anuma_category_key?: string | null
          confirmed_by_membership_id?: string | null
          created_at?: string
          group_name?: string
          id?: string
          item_count?: number
          organization_id?: string
          proposed_key?: string | null
          proposed_margin?: number | null
          proposed_score?: number | null
          status?: string
          subgroup_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_mappings_anuma_category_key_fkey"
            columns: ["anuma_category_key"]
            isOneToOne: false
            referencedRelation: "anuma_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "category_mappings_confirmed_by_membership_id_fkey"
            columns: ["confirmed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_proposed_key_fkey"
            columns: ["proposed_key"]
            isOneToOne: false
            referencedRelation: "anuma_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      category_resolutions: {
        Row: {
          id: string
          margin: number
          organization_id: string
          phrase: string
          resolved_at: string
          resolved_label: string
          score: number
        }
        Insert: {
          id?: string
          margin: number
          organization_id: string
          phrase: string
          resolved_at?: string
          resolved_label: string
          score: number
        }
        Update: {
          id?: string
          margin?: number
          organization_id?: string
          phrase?: string
          resolved_at?: string
          resolved_label?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_resolutions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      category_roles: {
        Row: {
          category: string
          created_at: string
          created_by_membership_id: string | null
          id: string
          intended_role: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          intended_role: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          intended_role?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_roles_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      check_definitions: {
        Row: {
          active: boolean
          applicability: string
          created_at: string
          created_by_membership_id: string | null
          description: string
          evaluation_strategy: string
          id: string
          is_starter: boolean
          key: string
          name: string
          observation_types: string[]
          organization_id: string
          phrase: string | null
          purpose: string
          supersedes_definition_id: string | null
          version: number
          weight: number | null
        }
        Insert: {
          active?: boolean
          applicability: string
          created_at?: string
          created_by_membership_id?: string | null
          description: string
          evaluation_strategy: string
          id?: string
          is_starter?: boolean
          key: string
          name: string
          observation_types?: string[]
          organization_id: string
          phrase?: string | null
          purpose: string
          supersedes_definition_id?: string | null
          version?: number
          weight?: number | null
        }
        Update: {
          active?: boolean
          applicability?: string
          created_at?: string
          created_by_membership_id?: string | null
          description?: string
          evaluation_strategy?: string
          id?: string
          is_starter?: boolean
          key?: string
          name?: string
          observation_types?: string[]
          organization_id?: string
          phrase?: string | null
          purpose?: string
          supersedes_definition_id?: string | null
          version?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "check_definitions_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_definitions_creator_org_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "check_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_definitions_supersedes_definition_id_fkey"
            columns: ["supersedes_definition_id"]
            isOneToOne: false
            referencedRelation: "check_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_definitions_supersedes_org_fk"
            columns: ["organization_id", "supersedes_definition_id"]
            isOneToOne: false
            referencedRelation: "check_definitions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      check_evaluations: {
        Row: {
          analysis_run_id: string
          applicability_reason: string | null
          check_definition_id: string
          conversation_id: string
          created_at: string
          evaluation_version: string
          evidence_group_id: string | null
          explanation: string
          id: string
          organization_id: string
          result_state: string
          review_run_id: string | null
        }
        Insert: {
          analysis_run_id: string
          applicability_reason?: string | null
          check_definition_id: string
          conversation_id: string
          created_at?: string
          evaluation_version?: string
          evidence_group_id?: string | null
          explanation: string
          id?: string
          organization_id: string
          result_state: string
          review_run_id?: string | null
        }
        Update: {
          analysis_run_id?: string
          applicability_reason?: string | null
          check_definition_id?: string
          conversation_id?: string
          created_at?: string
          evaluation_version?: string
          evidence_group_id?: string | null
          explanation?: string
          id?: string
          organization_id?: string
          result_state?: string
          review_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_evaluations_organization_id_check_definition_id_fkey"
            columns: ["organization_id", "check_definition_id"]
            isOneToOne: false
            referencedRelation: "check_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "check_evaluations_organization_id_conversation_id_analysis_fkey"
            columns: ["organization_id", "conversation_id", "analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "check_evaluations_organization_id_conversation_id_evidence_fkey"
            columns: ["organization_id", "conversation_id", "evidence_group_id"]
            isOneToOne: false
            referencedRelation: "evidence_groups"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "check_evaluations_review_run_fk"
            columns: ["organization_id", "conversation_id", "review_run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      consent_records: {
        Row: {
          capture_method: Database["public"]["Enums"]["consent_capture_method"]
          captured_at: string
          captured_by_membership_id: string
          conversation_id: string
          created_at: string
          evidence_metadata: Json
          id: string
          organization_id: string
          participant_id: string | null
          status: Database["public"]["Enums"]["consent_status"]
        }
        Insert: {
          capture_method: Database["public"]["Enums"]["consent_capture_method"]
          captured_at: string
          captured_by_membership_id: string
          conversation_id: string
          created_at?: string
          evidence_metadata?: Json
          id?: string
          organization_id: string
          participant_id?: string | null
          status: Database["public"]["Enums"]["consent_status"]
        }
        Update: {
          capture_method?: Database["public"]["Enums"]["consent_capture_method"]
          captured_at?: string
          captured_by_membership_id?: string
          conversation_id?: string
          created_at?: string
          evidence_metadata?: Json
          id?: string
          organization_id?: string
          participant_id?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_captured_by_fk"
            columns: ["organization_id", "captured_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "consent_records_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "consent_records_participant_fk"
            columns: ["organization_id", "conversation_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          display_label: string | null
          id: string
          membership_id: string | null
          organization_id: string
          role: Database["public"]["Enums"]["participant_role"]
        }
        Insert: {
          conversation_id: string
          created_at?: string
          display_label?: string | null
          id?: string
          membership_id?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["participant_role"]
        }
        Update: {
          conversation_id?: string
          created_at?: string
          display_label?: string | null
          id?: string
          membership_id?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["participant_role"]
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversation_participants_membership_fk"
            columns: ["organization_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      conversation_quality_assessments: {
        Row: {
          analysis_run_id: string | null
          analytics_eligible: boolean | null
          audio_quality: Database["public"]["Enums"]["quality_state"]
          benchmark_eligible: boolean | null
          conversation_id: string
          created_at: string
          diarization_quality: Database["public"]["Enums"]["quality_state"]
          exclusion_reason: string | null
          id: string
          organization_id: string
          outcome_comparison_eligible: boolean | null
          policy_version: string
          producer: string
          producer_version: string
          provenance_metadata: Json
          review_state: Database["public"]["Enums"]["review_state"]
          semantic_analysis_quality: Database["public"]["Enums"]["quality_state"]
          speaker_mapping_quality: Database["public"]["Enums"]["quality_state"]
          speaker_mapping_version_id: string | null
          transcription_quality: Database["public"]["Enums"]["quality_state"]
          transcription_run_id: string | null
        }
        Insert: {
          analysis_run_id?: string | null
          analytics_eligible?: boolean | null
          audio_quality?: Database["public"]["Enums"]["quality_state"]
          benchmark_eligible?: boolean | null
          conversation_id: string
          created_at?: string
          diarization_quality?: Database["public"]["Enums"]["quality_state"]
          exclusion_reason?: string | null
          id?: string
          organization_id: string
          outcome_comparison_eligible?: boolean | null
          policy_version: string
          producer: string
          producer_version: string
          provenance_metadata?: Json
          review_state?: Database["public"]["Enums"]["review_state"]
          semantic_analysis_quality?: Database["public"]["Enums"]["quality_state"]
          speaker_mapping_quality?: Database["public"]["Enums"]["quality_state"]
          speaker_mapping_version_id?: string | null
          transcription_quality?: Database["public"]["Enums"]["quality_state"]
          transcription_run_id?: string | null
        }
        Update: {
          analysis_run_id?: string | null
          analytics_eligible?: boolean | null
          audio_quality?: Database["public"]["Enums"]["quality_state"]
          benchmark_eligible?: boolean | null
          conversation_id?: string
          created_at?: string
          diarization_quality?: Database["public"]["Enums"]["quality_state"]
          exclusion_reason?: string | null
          id?: string
          organization_id?: string
          outcome_comparison_eligible?: boolean | null
          policy_version?: string
          producer?: string
          producer_version?: string
          provenance_metadata?: Json
          review_state?: Database["public"]["Enums"]["review_state"]
          semantic_analysis_quality?: Database["public"]["Enums"]["quality_state"]
          speaker_mapping_quality?: Database["public"]["Enums"]["quality_state"]
          speaker_mapping_version_id?: string | null
          transcription_quality?: Database["public"]["Enums"]["quality_state"]
          transcription_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_assessments_analysis_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "analysis_run_id",
            ]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: [
              "organization_id",
              "conversation_id",
              "source_transcription_run_id",
              "id",
            ]
          },
          {
            foreignKeyName: "quality_assessments_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "quality_assessments_mapping_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "speaker_mapping_version_id",
            ]
            isOneToOne: false
            referencedRelation: "speaker_mapping_versions"
            referencedColumns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "id",
            ]
          },
          {
            foreignKeyName: "quality_assessments_transcription_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
            ]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      conversations: {
        Row: {
          active_analysis_run_id: string | null
          active_speaker_mapping_version_id: string | null
          active_transcription_run_id: string | null
          created_at: string
          created_by_membership_id: string
          ended_at: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["conversation_status"]
          location_id: string | null
          organization_id: string
          representative_membership_id: string
          started_at: string
          team_id: string | null
          title: string | null
          updated_at: string
          vertical: Database["public"]["Enums"]["conversation_vertical"]
        }
        Insert: {
          active_analysis_run_id?: string | null
          active_speaker_mapping_version_id?: string | null
          active_transcription_run_id?: string | null
          created_at?: string
          created_by_membership_id: string
          ended_at?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["conversation_status"]
          location_id?: string | null
          organization_id: string
          representative_membership_id: string
          started_at: string
          team_id?: string | null
          title?: string | null
          updated_at?: string
          vertical: Database["public"]["Enums"]["conversation_vertical"]
        }
        Update: {
          active_analysis_run_id?: string | null
          active_speaker_mapping_version_id?: string | null
          active_transcription_run_id?: string | null
          created_at?: string
          created_by_membership_id?: string
          ended_at?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["conversation_status"]
          location_id?: string | null
          organization_id?: string
          representative_membership_id?: string
          started_at?: string
          team_id?: string | null
          title?: string | null
          updated_at?: string
          vertical?: Database["public"]["Enums"]["conversation_vertical"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_active_analysis_fk"
            columns: ["organization_id", "id", "active_analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "conversations_active_mapping_fk"
            columns: [
              "organization_id",
              "id",
              "active_speaker_mapping_version_id",
            ]
            isOneToOne: false
            referencedRelation: "speaker_mapping_versions"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "conversations_active_transcription_fk"
            columns: ["organization_id", "id", "active_transcription_run_id"]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "conversations_creator_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_location_fk"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_representative_fk"
            columns: ["organization_id", "representative_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_team_fk"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      evidence_groups: {
        Row: {
          conversation_id: string
          created_at: string
          created_by_membership_id: string | null
          id: string
          organization_id: string
          purpose: string
          source_analysis_run_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          organization_id: string
          purpose: string
          source_analysis_run_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          organization_id?: string
          purpose?: string
          source_analysis_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_groups_analysis_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "source_analysis_run_id",
            ]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "evidence_groups_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "evidence_groups_creator_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      evidence_references: {
        Row: {
          conversation_id: string
          created_at: string
          end_milliseconds: number | null
          evidence_group_id: string
          excerpt_checksum_sha256: string | null
          id: string
          organization_id: string
          sequence_number: number
          start_milliseconds: number | null
          transcript_segment_id: string
          transcription_run_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          end_milliseconds?: number | null
          evidence_group_id: string
          excerpt_checksum_sha256?: string | null
          id?: string
          organization_id: string
          sequence_number: number
          start_milliseconds?: number | null
          transcript_segment_id: string
          transcription_run_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          end_milliseconds?: number | null
          evidence_group_id?: string
          excerpt_checksum_sha256?: string | null
          id?: string
          organization_id?: string
          sequence_number?: number
          start_milliseconds?: number | null
          transcript_segment_id?: string
          transcription_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_references_group_fk"
            columns: ["organization_id", "conversation_id", "evidence_group_id"]
            isOneToOne: false
            referencedRelation: "evidence_groups"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "evidence_references_segment_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "transcript_segment_id",
            ]
            isOneToOne: false
            referencedRelation: "transcript_segments"
            referencedColumns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "id",
            ]
          },
        ]
      }
      interaction_field_definitions: {
        Row: {
          alternate_source_class:
            | Database["public"]["Enums"]["fact_source_class"]
            | null
          cardinality: string
          created_at: string
          created_by_membership_id: string | null
          definition: string
          enum_values: string[]
          id: string
          is_enabled: boolean
          is_system: boolean
          key: string
          label: string
          labelled: boolean
          organization_id: string
          requires_evidence: boolean
          scope: string | null
          sort_order: number
          source_class: Database["public"]["Enums"]["fact_source_class"]
          speaker_source: string | null
          task: string | null
          updated_at: string
          value_kind: string
        }
        Insert: {
          alternate_source_class?:
            | Database["public"]["Enums"]["fact_source_class"]
            | null
          cardinality?: string
          created_at?: string
          created_by_membership_id?: string | null
          definition: string
          enum_values?: string[]
          id?: string
          is_enabled?: boolean
          is_system?: boolean
          key: string
          label: string
          labelled?: boolean
          organization_id: string
          requires_evidence?: boolean
          scope?: string | null
          sort_order?: number
          source_class?: Database["public"]["Enums"]["fact_source_class"]
          speaker_source?: string | null
          task?: string | null
          updated_at?: string
          value_kind?: string
        }
        Update: {
          alternate_source_class?:
            | Database["public"]["Enums"]["fact_source_class"]
            | null
          cardinality?: string
          created_at?: string
          created_by_membership_id?: string | null
          definition?: string
          enum_values?: string[]
          id?: string
          is_enabled?: boolean
          is_system?: boolean
          key?: string
          label?: string
          labelled?: boolean
          organization_id?: string
          requires_evidence?: boolean
          scope?: string | null
          sort_order?: number
          source_class?: Database["public"]["Enums"]["fact_source_class"]
          speaker_source?: string | null
          task?: string | null
          updated_at?: string
          value_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_field_definitions_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_field_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_field_value_corrections: {
        Row: {
          conversation_id: string
          corrected_text: string | null
          created_at: string
          created_by_membership_id: string
          field_key: string
          field_value_id: string
          id: string
          interaction_record_id: string
          is_rejected: boolean
          note: string | null
          organization_id: string
        }
        Insert: {
          conversation_id: string
          corrected_text?: string | null
          created_at?: string
          created_by_membership_id: string
          field_key: string
          field_value_id: string
          id?: string
          interaction_record_id: string
          is_rejected?: boolean
          note?: string | null
          organization_id: string
        }
        Update: {
          conversation_id?: string
          corrected_text?: string | null
          created_at?: string
          created_by_membership_id?: string
          field_key?: string
          field_value_id?: string
          id?: string
          interaction_record_id?: string
          is_rejected?: boolean
          note?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_field_value_correctio_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_field_value_corrections_field_value_id_fkey"
            columns: ["field_value_id"]
            isOneToOne: false
            referencedRelation: "interaction_field_values"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_field_values: {
        Row: {
          abstention: Database["public"]["Enums"]["fact_abstention"] | null
          attributed_to: Database["public"]["Enums"]["fact_claimant"] | null
          conversation_id: string
          created_at: string
          currency_code: string | null
          evidence_group_id: string | null
          field_key: string
          id: string
          interaction_record_id: string
          label: string | null
          organization_id: string
          original_model_value: Json
          source_class: Database["public"]["Enums"]["fact_source_class"]
          spoken_amount: number | null
          spoken_scale: string | null
          value_amount_minor: number | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          abstention?: Database["public"]["Enums"]["fact_abstention"] | null
          attributed_to?: Database["public"]["Enums"]["fact_claimant"] | null
          conversation_id: string
          created_at?: string
          currency_code?: string | null
          evidence_group_id?: string | null
          field_key: string
          id?: string
          interaction_record_id: string
          label?: string | null
          organization_id: string
          original_model_value: Json
          source_class: Database["public"]["Enums"]["fact_source_class"]
          spoken_amount?: number | null
          spoken_scale?: string | null
          value_amount_minor?: number | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          abstention?: Database["public"]["Enums"]["fact_abstention"] | null
          attributed_to?: Database["public"]["Enums"]["fact_claimant"] | null
          conversation_id?: string
          created_at?: string
          currency_code?: string | null
          evidence_group_id?: string | null
          field_key?: string
          id?: string
          interaction_record_id?: string
          label?: string | null
          organization_id?: string
          original_model_value?: Json
          source_class?: Database["public"]["Enums"]["fact_source_class"]
          spoken_amount?: number | null
          spoken_scale?: string | null
          value_amount_minor?: number | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_values_evidence_fk"
            columns: ["organization_id", "conversation_id", "evidence_group_id"]
            isOneToOne: false
            referencedRelation: "evidence_groups"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "field_values_record_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "interaction_record_id",
            ]
            isOneToOne: false
            referencedRelation: "interaction_records"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      interaction_metrics: {
        Row: {
          algorithm_version: string
          alternative_offered: string | null
          arrival_intent: string | null
          budget_currency: string | null
          clarity_delta: number | null
          clarity_end: number | null
          clarity_start: number | null
          competitor_count: number
          computed_at: string
          conversation_id: string
          cross_sell_count: number
          customer_question_count: number
          decision_state: string | null
          demo_performed: string | null
          finance_requested: boolean
          id: string
          interaction_record_id: string
          location_id: string | null
          max_budget_minor: number | null
          objection_count: number
          objection_coverage: number | null
          organization_id: string
          price_gap: number | null
          price_gap_basis: string | null
          products_considered_count: number
          products_recommended_count: number
          promotion_discussed: boolean
          purchase_category: string | null
          red_flag_count: number
          requirement_count: number
          started_at: string
          target_budget_minor: number | null
          team_id: string | null
          upsell_count: number
          use_case_count: number
          vertical: Database["public"]["Enums"]["conversation_vertical"]
        }
        Insert: {
          algorithm_version: string
          alternative_offered?: string | null
          arrival_intent?: string | null
          budget_currency?: string | null
          clarity_delta?: number | null
          clarity_end?: number | null
          clarity_start?: number | null
          competitor_count?: number
          computed_at?: string
          conversation_id: string
          cross_sell_count?: number
          customer_question_count?: number
          decision_state?: string | null
          demo_performed?: string | null
          finance_requested?: boolean
          id?: string
          interaction_record_id: string
          location_id?: string | null
          max_budget_minor?: number | null
          objection_count?: number
          objection_coverage?: number | null
          organization_id: string
          price_gap?: number | null
          price_gap_basis?: string | null
          products_considered_count?: number
          products_recommended_count?: number
          promotion_discussed?: boolean
          purchase_category?: string | null
          red_flag_count?: number
          requirement_count?: number
          started_at: string
          target_budget_minor?: number | null
          team_id?: string | null
          upsell_count?: number
          use_case_count?: number
          vertical: Database["public"]["Enums"]["conversation_vertical"]
        }
        Update: {
          algorithm_version?: string
          alternative_offered?: string | null
          arrival_intent?: string | null
          budget_currency?: string | null
          clarity_delta?: number | null
          clarity_end?: number | null
          clarity_start?: number | null
          competitor_count?: number
          computed_at?: string
          conversation_id?: string
          cross_sell_count?: number
          customer_question_count?: number
          decision_state?: string | null
          demo_performed?: string | null
          finance_requested?: boolean
          id?: string
          interaction_record_id?: string
          location_id?: string | null
          max_budget_minor?: number | null
          objection_count?: number
          objection_coverage?: number | null
          organization_id?: string
          price_gap?: number | null
          price_gap_basis?: string | null
          products_considered_count?: number
          products_recommended_count?: number
          promotion_discussed?: boolean
          purchase_category?: string | null
          red_flag_count?: number
          requirement_count?: number
          started_at?: string
          target_budget_minor?: number | null
          team_id?: string | null
          upsell_count?: number
          use_case_count?: number
          vertical?: Database["public"]["Enums"]["conversation_vertical"]
        }
        Relationships: [
          {
            foreignKeyName: "interaction_metrics_record_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "interaction_record_id",
            ]
            isOneToOne: false
            referencedRelation: "interaction_records"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      interaction_records: {
        Row: {
          completed_at: string | null
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number | null
          model: string
          organization_id: string
          output_tokens: number | null
          rejected_value_count: number
          schema_version: string
          source_transcription_run_id: string
          speaker_mapping_version_id: string
          status: Database["public"]["Enums"]["run_status"]
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          organization_id: string
          output_tokens?: number | null
          rejected_value_count?: number
          schema_version: string
          source_transcription_run_id: string
          speaker_mapping_version_id: string
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          organization_id?: string
          output_tokens?: number | null
          rejected_value_count?: number
          schema_version?: string
          source_transcription_run_id?: string
          speaker_mapping_version_id?: string
          status?: Database["public"]["Enums"]["run_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interaction_records_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "interaction_records_transcription_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "source_transcription_run_id",
            ]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      inventory: {
        Row: {
          as_of: string
          created_at: string
          id: string
          item_id: string
          location_id: string | null
          organization_id: string
          stock: number
        }
        Insert: {
          as_of?: string
          created_at?: string
          id?: string
          item_id: string
          location_id?: string | null
          organization_id: string
          stock: number
        }
        Update: {
          as_of?: string
          created_at?: string
          id?: string
          item_id?: string
          location_id?: string | null
          organization_id?: string
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          business_code: string | null
          created_at: string
          id: string
          is_active: boolean
          location_type: Database["public"]["Enums"]["location_type"]
          name: string
          organization_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          business_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["location_type"]
          name: string
          organization_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          business_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["location_type"]
          name?: string
          organization_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          location_id: string | null
          membership_id: string
          organization_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          membership_id: string
          organization_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          membership_id?: string
          organization_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_assignments_location_fk"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "member_assignments_membership_fk"
            columns: ["organization_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "member_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_assignments_team_fk"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      metric_runs: {
        Row: {
          algorithm_version: string
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          source_transcription_run_id: string
          speaker_mapping_version_id: string
        }
        Insert: {
          algorithm_version: string
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          source_transcription_run_id: string
          speaker_mapping_version_id: string
        }
        Update: {
          algorithm_version?: string
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          source_transcription_run_id?: string
          speaker_mapping_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_runs_organization_id_conversation_id_source_transc_fkey1"
            columns: [
              "organization_id",
              "conversation_id",
              "source_transcription_run_id",
              "speaker_mapping_version_id",
            ]
            isOneToOne: false
            referencedRelation: "speaker_mapping_versions"
            referencedColumns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "id",
            ]
          },
          {
            foreignKeyName: "metric_runs_organization_id_conversation_id_source_transcr_fkey"
            columns: [
              "organization_id",
              "conversation_id",
              "source_transcription_run_id",
            ]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      metric_values: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          metric_key: string
          metric_run_id: string
          numeric_value: number
          organization_id: string
          unit: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          metric_key: string
          metric_run_id: string
          numeric_value: number
          organization_id: string
          unit: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          metric_key?: string
          metric_run_id?: string
          numeric_value?: number
          organization_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_values_organization_id_conversation_id_metric_run_i_fkey"
            columns: ["organization_id", "conversation_id", "metric_run_id"]
            isOneToOne: false
            referencedRelation: "metric_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      observation_corrections: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          observation_id: string
          organization_id: string
          proposed_by_membership_id: string
          proposed_value: Json
          reason: string | null
          review_state: Database["public"]["Enums"]["review_state"]
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          observation_id: string
          organization_id: string
          proposed_by_membership_id: string
          proposed_value: Json
          reason?: string | null
          review_state?: Database["public"]["Enums"]["review_state"]
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          observation_id?: string
          organization_id?: string
          proposed_by_membership_id?: string
          proposed_value?: Json
          reason?: string | null
          review_state?: Database["public"]["Enums"]["review_state"]
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observation_corrections_organization_id_conversation_id_ob_fkey"
            columns: ["organization_id", "conversation_id", "observation_id"]
            isOneToOne: false
            referencedRelation: "structured_observations"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "observation_corrections_organization_id_proposed_by_member_fkey"
            columns: ["organization_id", "proposed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "observation_corrections_organization_id_reviewed_by_member_fkey"
            columns: ["organization_id", "reviewed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          delivery_status: string
          email: string
          expires_at: string
          id: string
          invited_by_membership_id: string | null
          invited_user_id: string | null
          last_sent_at: string | null
          location_id: string | null
          organization_id: string
          requires_first_access: boolean
          revoked_at: string | null
          role: Database["public"]["Enums"]["membership_role"]
          send_attempt_count: number
          status: Database["public"]["Enums"]["organization_invitation_status"]
          team_id: string | null
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          delivery_status?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_membership_id?: string | null
          invited_user_id?: string | null
          last_sent_at?: string | null
          location_id?: string | null
          organization_id: string
          requires_first_access?: boolean
          revoked_at?: string | null
          role: Database["public"]["Enums"]["membership_role"]
          send_attempt_count?: number
          status?: Database["public"]["Enums"]["organization_invitation_status"]
          team_id?: string | null
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          delivery_status?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_membership_id?: string | null
          invited_user_id?: string | null
          last_sent_at?: string | null
          location_id?: string | null
          organization_id?: string
          requires_first_access?: boolean
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"]
          send_attempt_count?: number
          status?: Database["public"]["Enums"]["organization_invitation_status"]
          team_id?: string | null
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_invited_by_membership_id_fkey"
            columns: ["invited_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_scope_location_fk"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_invitations_scope_team_fk"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country_code: string
          created_at: string
          default_currency: string
          environment_type: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          default_currency?: string
          environment_type?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          default_currency?: string
          environment_type?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      outcome_events: {
        Row: {
          conversation_id: string
          created_at: string
          created_by_membership_id: string
          currency_code: string | null
          event_type: string
          external_reference: string | null
          id: string
          occurred_at: string
          organization_id: string
          source: Database["public"]["Enums"]["outcome_source"]
          value_amount_minor: number | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by_membership_id: string
          currency_code?: string | null
          event_type: string
          external_reference?: string | null
          id?: string
          occurred_at: string
          organization_id: string
          source?: Database["public"]["Enums"]["outcome_source"]
          value_amount_minor?: number | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by_membership_id?: string
          currency_code?: string | null
          event_type?: string
          external_reference?: string | null
          id?: string
          occurred_at?: string
          organization_id?: string
          source?: Database["public"]["Enums"]["outcome_source"]
          value_amount_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_events_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "outcome_events_creator_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      product_knowledge: {
        Row: {
          brand: string
          brand_key: string
          created_at: string
          descriptors: string[]
          id: string
          model: string
          model_key: string
          recognised: boolean
          source_model: string
          suited_to: string[]
        }
        Insert: {
          brand: string
          brand_key: string
          created_at?: string
          descriptors?: string[]
          id?: string
          model: string
          model_key: string
          recognised?: boolean
          source_model: string
          suited_to?: string[]
        }
        Update: {
          brand?: string
          brand_key?: string
          created_at?: string
          descriptors?: string[]
          id?: string
          model?: string
          model_key?: string
          recognised?: boolean
          source_model?: string
          suited_to?: string[]
        }
        Relationships: []
      }
      recordings: {
        Row: {
          capture_source: string
          checksum_sha256: string | null
          conversation_id: string
          created_at: string
          created_by_membership_id: string
          duration_milliseconds: number | null
          file_size_bytes: number
          finalized_at: string | null
          id: string
          mime_type: string
          organization_id: string
          original_filename: string | null
          status: Database["public"]["Enums"]["recording_status"]
          storage_bucket: string
          storage_object_path: string
          updated_at: string
        }
        Insert: {
          capture_source?: string
          checksum_sha256?: string | null
          conversation_id: string
          created_at?: string
          created_by_membership_id: string
          duration_milliseconds?: number | null
          file_size_bytes: number
          finalized_at?: string | null
          id?: string
          mime_type: string
          organization_id: string
          original_filename?: string | null
          status?: Database["public"]["Enums"]["recording_status"]
          storage_bucket?: string
          storage_object_path: string
          updated_at?: string
        }
        Update: {
          capture_source?: string
          checksum_sha256?: string | null
          conversation_id?: string
          created_at?: string
          created_by_membership_id?: string
          duration_milliseconds?: number | null
          file_size_bytes?: number
          finalized_at?: string | null
          id?: string
          mime_type?: string
          organization_id?: string
          original_filename?: string | null
          status?: Database["public"]["Enums"]["recording_status"]
          storage_bucket?: string
          storage_object_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordings_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "recordings_created_by_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      review_runs: {
        Row: {
          analysis_run_id: string
          completed_at: string | null
          configuration_snapshot: Json
          conversation_id: string
          created_at: string
          created_by_membership_id: string | null
          error_code: string | null
          error_message: string | null
          evaluation_version: string
          id: string
          organization_id: string
          semantic_request_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          trigger_reason: string
        }
        Insert: {
          analysis_run_id: string
          completed_at?: string | null
          configuration_snapshot: Json
          conversation_id: string
          created_at?: string
          created_by_membership_id?: string | null
          error_code?: string | null
          error_message?: string | null
          evaluation_version: string
          id?: string
          organization_id: string
          semantic_request_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          trigger_reason: string
        }
        Update: {
          analysis_run_id?: string
          completed_at?: string | null
          configuration_snapshot?: Json
          conversation_id?: string
          created_at?: string
          created_by_membership_id?: string | null
          error_code?: string | null
          error_message?: string | null
          evaluation_version?: string
          id?: string
          organization_id?: string
          semantic_request_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_runs_organization_id_conversation_id_analysis_run_i_fkey"
            columns: ["organization_id", "conversation_id", "analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "review_runs_organization_id_created_by_membership_id_fkey"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      scorecard_definition_checks: {
        Row: {
          check_definition_id: string
          created_at: string
          organization_id: string
          scorecard_definition_id: string
        }
        Insert: {
          check_definition_id: string
          created_at?: string
          organization_id: string
          scorecard_definition_id: string
        }
        Update: {
          check_definition_id?: string
          created_at?: string
          organization_id?: string
          scorecard_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scorecard_definition_checks_organization_id_check_definiti_fkey"
            columns: ["organization_id", "check_definition_id"]
            isOneToOne: false
            referencedRelation: "check_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "scorecard_definition_checks_organization_id_scorecard_defi_fkey"
            columns: ["organization_id", "scorecard_definition_id"]
            isOneToOne: false
            referencedRelation: "scorecard_definitions"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      scorecard_definitions: {
        Row: {
          active: boolean
          check_definition_ids: string[]
          created_at: string
          created_by_membership_id: string | null
          id: string
          key: string
          name: string
          organization_id: string
          version: number
        }
        Insert: {
          active?: boolean
          check_definition_ids: string[]
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          key: string
          name: string
          organization_id: string
          version?: number
        }
        Update: {
          active?: boolean
          check_definition_ids?: string[]
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          key?: string
          name?: string
          organization_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scorecard_definitions_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scorecard_definitions_creator_org_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "scorecard_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecard_evaluations: {
        Row: {
          analysis_run_id: string
          applicable_check_count: number
          conversation_id: string
          created_at: string
          evaluated_check_count: number
          evaluation_version: string
          id: string
          insufficient_evidence_count: number
          organization_id: string
          review_run_id: string | null
          score_percent: number | null
          scorecard_definition_id: string
        }
        Insert: {
          analysis_run_id: string
          applicable_check_count?: number
          conversation_id: string
          created_at?: string
          evaluated_check_count?: number
          evaluation_version?: string
          id?: string
          insufficient_evidence_count?: number
          organization_id: string
          review_run_id?: string | null
          score_percent?: number | null
          scorecard_definition_id: string
        }
        Update: {
          analysis_run_id?: string
          applicable_check_count?: number
          conversation_id?: string
          created_at?: string
          evaluated_check_count?: number
          evaluation_version?: string
          id?: string
          insufficient_evidence_count?: number
          organization_id?: string
          review_run_id?: string | null
          score_percent?: number | null
          scorecard_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scorecard_evaluations_organization_id_conversation_id_anal_fkey"
            columns: ["organization_id", "conversation_id", "analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "scorecard_evaluations_organization_id_scorecard_definition_fkey"
            columns: ["organization_id", "scorecard_definition_id"]
            isOneToOne: false
            referencedRelation: "scorecard_definitions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "scorecard_evaluations_review_run_fk"
            columns: ["organization_id", "conversation_id", "review_run_id"]
            isOneToOne: false
            referencedRelation: "review_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      speaker_mapping_entries: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          participant_id: string | null
          participant_role: Database["public"]["Enums"]["participant_role"]
          provider_speaker_identifier: string
          speaker_mapping_version_id: string
          transcription_run_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          participant_id?: string | null
          participant_role: Database["public"]["Enums"]["participant_role"]
          provider_speaker_identifier: string
          speaker_mapping_version_id: string
          transcription_run_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          participant_id?: string | null
          participant_role?: Database["public"]["Enums"]["participant_role"]
          provider_speaker_identifier?: string
          speaker_mapping_version_id?: string
          transcription_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_mapping_entries_participant_fk"
            columns: ["organization_id", "conversation_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "conversation_participants"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "speaker_mapping_entries_version_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "speaker_mapping_version_id",
            ]
            isOneToOne: false
            referencedRelation: "speaker_mapping_versions"
            referencedColumns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
              "id",
            ]
          },
        ]
      }
      speaker_mapping_versions: {
        Row: {
          confidence: number | null
          conversation_id: string
          created_at: string
          created_by_membership_id: string | null
          id: string
          organization_id: string
          reason: string | null
          source: Database["public"]["Enums"]["speaker_mapping_source"]
          status: Database["public"]["Enums"]["speaker_mapping_status"]
          transcription_run_id: string
          version_number: number
        }
        Insert: {
          confidence?: number | null
          conversation_id: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          source: Database["public"]["Enums"]["speaker_mapping_source"]
          status?: Database["public"]["Enums"]["speaker_mapping_status"]
          transcription_run_id: string
          version_number: number
        }
        Update: {
          confidence?: number | null
          conversation_id?: string
          created_at?: string
          created_by_membership_id?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["speaker_mapping_source"]
          status?: Database["public"]["Enums"]["speaker_mapping_status"]
          transcription_run_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "speaker_mapping_versions_creator_fk"
            columns: ["organization_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "speaker_mapping_versions_run_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
            ]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      spoken_category_mappings: {
        Row: {
          anuma_category_key: string | null
          confirmed_by_membership_id: string | null
          created_at: string
          id: string
          occurrence_count: number
          organization_id: string
          phrase: string
          proposed_key: string | null
          proposed_margin: number | null
          proposed_score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          anuma_category_key?: string | null
          confirmed_by_membership_id?: string | null
          created_at?: string
          id?: string
          occurrence_count?: number
          organization_id: string
          phrase: string
          proposed_key?: string | null
          proposed_margin?: number | null
          proposed_score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          anuma_category_key?: string | null
          confirmed_by_membership_id?: string | null
          created_at?: string
          id?: string
          occurrence_count?: number
          organization_id?: string
          phrase?: string
          proposed_key?: string | null
          proposed_margin?: number | null
          proposed_score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spoken_category_mappings_anuma_category_key_fkey"
            columns: ["anuma_category_key"]
            isOneToOne: false
            referencedRelation: "anuma_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "spoken_category_mappings_confirmed_by_membership_id_fkey"
            columns: ["confirmed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spoken_category_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spoken_category_mappings_proposed_key_fkey"
            columns: ["proposed_key"]
            isOneToOne: false
            referencedRelation: "anuma_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      structured_observations: {
        Row: {
          analysis_run_id: string
          attributes: Json
          conversation_id: string
          created_at: string
          currency_code: string | null
          evidence_group_id: string
          id: string
          normalized_key: string
          observation_type: string
          organization_id: string
          original_model_value: Json
          value_amount_minor: number | null
          value_text: string | null
        }
        Insert: {
          analysis_run_id: string
          attributes?: Json
          conversation_id: string
          created_at?: string
          currency_code?: string | null
          evidence_group_id: string
          id?: string
          normalized_key: string
          observation_type: string
          organization_id: string
          original_model_value: Json
          value_amount_minor?: number | null
          value_text?: string | null
        }
        Update: {
          analysis_run_id?: string
          attributes?: Json
          conversation_id?: string
          created_at?: string
          currency_code?: string | null
          evidence_group_id?: string
          id?: string
          normalized_key?: string
          observation_type?: string
          organization_id?: string
          original_model_value?: Json
          value_amount_minor?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observations_analysis_fk"
            columns: ["organization_id", "conversation_id", "analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "observations_evidence_fk"
            columns: ["organization_id", "conversation_id", "evidence_group_id"]
            isOneToOne: false
            referencedRelation: "evidence_groups"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          confidence: number | null
          conversation_id: string
          created_at: string
          detected_languages: string[]
          end_milliseconds: number
          id: string
          organization_id: string
          original_text: string
          provider_speaker_identifier: string | null
          sequence_number: number
          start_milliseconds: number
          transcription_run_id: string
        }
        Insert: {
          confidence?: number | null
          conversation_id: string
          created_at?: string
          detected_languages?: string[]
          end_milliseconds: number
          id?: string
          organization_id: string
          original_text: string
          provider_speaker_identifier?: string | null
          sequence_number: number
          start_milliseconds: number
          transcription_run_id: string
        }
        Update: {
          confidence?: number | null
          conversation_id?: string
          created_at?: string
          detected_languages?: string[]
          end_milliseconds?: number
          id?: string
          organization_id?: string
          original_text?: string
          provider_speaker_identifier?: string | null
          sequence_number?: number
          start_milliseconds?: number
          transcription_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_run_fk"
            columns: [
              "organization_id",
              "conversation_id",
              "transcription_run_id",
            ]
            isOneToOne: false
            referencedRelation: "transcription_runs"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
        ]
      }
      transcription_runs: {
        Row: {
          completed_at: string | null
          conversation_id: string
          cost_currency: string | null
          cost_minor: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          latency_milliseconds: number | null
          model: string
          organization_id: string
          provider: string
          provider_metadata: Json
          provider_model_version: string | null
          provider_request_id: string | null
          recording_id: string
          requested_by_membership_id: string | null
          requested_language_mode: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          workflow_run_id: string | null
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          cost_currency?: string | null
          cost_minor?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_milliseconds?: number | null
          model: string
          organization_id: string
          provider: string
          provider_metadata?: Json
          provider_model_version?: string | null
          provider_request_id?: string | null
          recording_id: string
          requested_by_membership_id?: string | null
          requested_language_mode?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          workflow_run_id?: string | null
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          cost_currency?: string | null
          cost_minor?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_milliseconds?: number | null
          model?: string
          organization_id?: string
          provider?: string
          provider_metadata?: Json
          provider_model_version?: string | null
          provider_request_id?: string | null
          recording_id?: string
          requested_by_membership_id?: string | null
          requested_language_mode?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcription_runs_recording_fk"
            columns: ["organization_id", "conversation_id", "recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["organization_id", "conversation_id", "id"]
          },
          {
            foreignKeyName: "transcription_runs_requested_by_fk"
            columns: ["organization_id", "requested_by_membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: { p_invitation_id: string; p_token_hash: string }
        Returns: {
          membership_id: string
          organization_id: string
        }[]
      }
      append_customer_recording_consent: {
        Args: {
          p_capture_method: Database["public"]["Enums"]["consent_capture_method"]
          p_conversation_id: string
          p_status: Database["public"]["Enums"]["consent_status"]
        }
        Returns: string
      }
      apply_catalogue_import: {
        Args: { p_import_id: string }
        Returns: {
          added: number
          changed: number
          delisted: number
          unchanged: number
        }[]
      }
      attach_organization_invitation_user: {
        Args: { p_invitation_id: string; p_user_id: string }
        Returns: undefined
      }
      bootstrap_organization: {
        Args: {
          p_country_code?: string
          p_default_currency?: string
          p_name: string
          p_timezone?: string
        }
        Returns: {
          membership_id: string
          organization_id: string
        }[]
      }
      catalogue_candidates: {
        Args: {
          p_as_of: string
          p_brand?: string
          p_limit?: number
          p_organization_id: string
          p_tokens?: string[]
        }
        Returns: {
          brand_name: string
          description: string
          group_name: string
          id: string
          item_id: string
          spec_cpu_family: string
          spec_gpu_gb: number
          spec_issues: string[]
          spec_ram_gb: number
          spec_screen_in: number
          spec_storage_gb: number
          subgroup_name: string
        }[]
      }
      catalogue_label_summary: {
        Args: { p_organization_id: string }
        Returns: {
          group_name: string
          item_count: number
          subgroup_name: string
        }[]
      }
      catalogue_requirement_matches: {
        Args: {
          p_as_of: string
          p_category_key: string
          p_limit?: number
          p_min_gpu_gb?: number
          p_min_ram_gb?: number
          p_min_storage_gb?: number
          p_organization_id: string
        }
        Returns: {
          brand_name: string
          description: string
          group_name: string
          id: string
          item_id: string
          spec_cpu_family: string
          spec_gpu_gb: number
          spec_issues: string[]
          spec_ram_gb: number
          spec_screen_in: number
          spec_storage_gb: number
          subgroup_name: string
          total_matching: number
        }[]
      }
      catalogue_spec_health: {
        Args: { p_organization_id: string }
        Returns: {
          example_description: string
          issue: string
          item_count: number
        }[]
      }
      confirm_clear_category_mappings: {
        Args: {
          p_membership_id: string
          p_min_margin: number
          p_organization_id: string
        }
        Returns: number
      }
      confirm_clear_spoken_mappings: {
        Args: {
          p_membership_id: string
          p_min_margin: number
          p_organization_id: string
        }
        Returns: number
      }
      create_automatic_speaker_mapping: {
        Args: {
          p_confidence: number
          p_entries: Json
          p_reason?: string
          p_transcription_run_id: string
        }
        Returns: string
      }
      create_conversation_with_consent: {
        Args: {
          p_consent_capture_method?: Database["public"]["Enums"]["consent_capture_method"]
          p_consent_status?: Database["public"]["Enums"]["consent_status"]
          p_location_id?: string
          p_organization_id: string
          p_started_at: string
          p_team_id?: string
          p_title?: string
          p_vertical: Database["public"]["Enums"]["conversation_vertical"]
        }
        Returns: string
      }
      create_organization_check: {
        Args: {
          p_applicability: string
          p_description: string
          p_evaluation_strategy: string
          p_name: string
          p_organization_id: string
          p_phrase?: string
          p_purpose: string
          p_weight?: number
        }
        Returns: string
      }
      create_organization_invitation: {
        Args: {
          p_email: string
          p_location_id?: string
          p_organization_id: string
          p_role: Database["public"]["Enums"]["membership_role"]
          p_team_id?: string
          p_token_hash?: string
        }
        Returns: {
          existing_user_id: string
          invitation_id: string
          requires_first_access: boolean
        }[]
      }
      create_speaker_mapping_version: {
        Args: {
          p_entries: Json
          p_reason?: string
          p_transcription_run_id: string
        }
        Returns: string
      }
      finalize_recording_upload: {
        Args: { p_recording_id: string }
        Returns: undefined
      }
      organization_member_directory: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          membership_id: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }[]
      }
      persist_analysis_result: {
        Args: {
          p_analysis_run_id: string
          p_metric_values: Json
          p_observations: Json
        }
        Returns: {
          already_persisted: boolean
          metric_run_id: string
        }[]
      }
      persist_interaction_record: {
        Args: { p_record_id: string; p_values: Json }
        Returns: {
          already_persisted: boolean
          persisted_values: number
        }[]
      }
      persist_interaction_review: {
        Args: {
          p_check_evaluations: Json
          p_review_run_id: string
          p_scorecard_evaluations: Json
          p_semantic_request_count?: number
        }
        Returns: undefined
      }
      prepare_recording_upload: {
        Args: {
          p_capture_source: string
          p_conversation_id: string
          p_duration_milliseconds: number
          p_file_size_bytes: number
          p_mime_type: string
          p_original_filename?: string
        }
        Returns: {
          recording_id: string
          storage_bucket: string
          storage_object_path: string
        }[]
      }
      propose_observation_correction: {
        Args: {
          p_observation_id: string
          p_proposed_value: Json
          p_reason?: string
        }
        Returns: string
      }
      provision_customer_organization: {
        Args: {
          p_country_code: string
          p_default_currency: string
          p_environment_type?: string
          p_initial_admin_email: string
          p_name: string
          p_slug: string
          p_timezone: string
          p_token_hash: string
        }
        Returns: {
          existing_user_id: string
          invitation_id: string
          organization_id: string
        }[]
      }
      request_interaction_review: {
        Args: { p_conversation_id: string; p_trigger_reason?: string }
        Returns: string
      }
      request_interaction_understanding: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      request_transcription_run: {
        Args: { p_recording_id: string }
        Returns: string
      }
      review_observation_correction: {
        Args: {
          p_correction_id: string
          p_review_state: Database["public"]["Enums"]["review_state"]
        }
        Returns: undefined
      }
      rotate_organization_invitation: {
        Args: { p_invitation_id: string; p_token_hash: string }
        Returns: {
          email: string
          existing_user_id: string
          invitation_id: string
          requires_first_access: boolean
        }[]
      }
      seed_starter_electronics_checks: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spoken_category_summary: {
        Args: { p_organization_id: string }
        Returns: {
          occurrence_count: number
          phrase: string
        }[]
      }
      update_organization_member: {
        Args: {
          p_location_id?: string
          p_membership_id: string
          p_role: Database["public"]["Enums"]["membership_role"]
          p_status: Database["public"]["Enums"]["membership_status"]
          p_team_id?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      consent_capture_method:
        | "verbal"
        | "written"
        | "digital"
        | "imported"
        | "other"
      consent_status:
        | "granted"
        | "declined"
        | "withdrawn"
        | "not_required"
        | "unknown"
      conversation_status:
        | "draft"
        | "ready_for_recording"
        | "processing"
        | "ready"
        | "partial"
        | "failed"
        | "archived"
      conversation_vertical: "electronics" | "automotive"
      fact_abstention:
        | "not_stated"
        | "insufficient_evidence"
        | "ambiguous"
        | "unknown"
      fact_claimant: "representative" | "customer" | "other"
      fact_source_class:
        | "verified"
        | "evidence_extracted"
        | "evaluated"
        | "inferred"
      location_type: "store" | "showroom" | "office" | "other"
      membership_role: "representative" | "manager" | "admin"
      membership_status: "active" | "inactive"
      organization_invitation_status:
        | "pending"
        | "accepted"
        | "expired"
        | "revoked"
      outcome_source: "manual" | "import"
      participant_role:
        | "representative"
        | "customer"
        | "additional_customer"
        | "manager"
        | "unknown"
      quality_state:
        | "adequate"
        | "limited"
        | "insufficient"
        | "unknown"
        | "not_assessed"
      recording_status:
        | "pending"
        | "uploading"
        | "uploaded"
        | "failed"
        | "deleted"
      review_state: "unreviewed" | "confirmed" | "needs_review" | "rejected"
      run_status: "pending" | "running" | "completed" | "failed" | "cancelled"
      speaker_mapping_source: "model" | "human" | "hybrid"
      speaker_mapping_status: "draft" | "active" | "superseded"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      consent_capture_method: [
        "verbal",
        "written",
        "digital",
        "imported",
        "other",
      ],
      consent_status: [
        "granted",
        "declined",
        "withdrawn",
        "not_required",
        "unknown",
      ],
      conversation_status: [
        "draft",
        "ready_for_recording",
        "processing",
        "ready",
        "partial",
        "failed",
        "archived",
      ],
      conversation_vertical: ["electronics", "automotive"],
      fact_abstention: [
        "not_stated",
        "insufficient_evidence",
        "ambiguous",
        "unknown",
      ],
      fact_claimant: ["representative", "customer", "other"],
      fact_source_class: [
        "verified",
        "evidence_extracted",
        "evaluated",
        "inferred",
      ],
      location_type: ["store", "showroom", "office", "other"],
      membership_role: ["representative", "manager", "admin"],
      membership_status: ["active", "inactive"],
      organization_invitation_status: [
        "pending",
        "accepted",
        "expired",
        "revoked",
      ],
      outcome_source: ["manual", "import"],
      participant_role: [
        "representative",
        "customer",
        "additional_customer",
        "manager",
        "unknown",
      ],
      quality_state: [
        "adequate",
        "limited",
        "insufficient",
        "unknown",
        "not_assessed",
      ],
      recording_status: [
        "pending",
        "uploading",
        "uploaded",
        "failed",
        "deleted",
      ],
      review_state: ["unreviewed", "confirmed", "needs_review", "rejected"],
      run_status: ["pending", "running", "completed", "failed", "cancelled"],
      speaker_mapping_source: ["model", "human", "hybrid"],
      speaker_mapping_status: ["draft", "active", "superseded"],
    },
  },
} as const

