
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_profile_id": string | null,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"new_value": Json | null,"old_value": Json | null,"request_id": string | null
                  }
                  Insert: {
                    "action": string,"actor_profile_id"?: string | null,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"new_value"?: Json | null,"old_value"?: Json | null,"request_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_profile_id"?: string | null,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"new_value"?: Json | null,"old_value"?: Json | null,"request_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_profile_id_fkey"
      columns: ["actor_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"debate_formats": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"display_order": number,"id": string,"name": string,"team_size": number,"teams_per_match": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"display_order": number,"id"?: string,"name": string,"team_size": number,"teams_per_match": number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"display_order"?: number,"id"?: string,"name"?: string,"team_size"?: number,"teams_per_match"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"event_formats": {
                  Row: {
                    "created_at": string,"enabled": boolean,"event_id": string,"format_id": string,"id": string,"motion": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"event_id": string,"format_id": string,"id"?: string,"motion"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"event_id"?: string,"format_id"?: string,"id"?: string,"motion"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_formats_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_formats_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "check_in_opens_at": string,"created_at": string,"created_by": string,"ends_at": string,"event_date": string,"id": string,"meeting_url": string | null,"notice": string | null,"registration_closes_at": string,"registration_opens_at": string,"starts_at": string,"status": Database["public"]['Enums']["event_status"],"timezone": string,"title": string,"updated_at": string,"warning_at": string
                  }
                  Insert: {
                    "check_in_opens_at": string,"created_at"?: string,"created_by": string,"ends_at": string,"event_date": string,"id"?: string,"meeting_url"?: string | null,"notice"?: string | null,"registration_closes_at": string,"registration_opens_at": string,"starts_at": string,"status"?: Database["public"]['Enums']["event_status"],"timezone"?: string,"title": string,"updated_at"?: string,"warning_at": string
                  }
                  Update: {
                    "check_in_opens_at"?: string,"created_at"?: string,"created_by"?: string,"ends_at"?: string,"event_date"?: string,"id"?: string,"meeting_url"?: string | null,"notice"?: string | null,"registration_closes_at"?: string,"registration_opens_at"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["event_status"],"timezone"?: string,"title"?: string,"updated_at"?: string,"warning_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"format_positions": {
                  Row: {
                    "code": string,"created_at": string,"display_name": string,"display_order": number,"format_id": string,"id": string,"team_slot": number,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"display_name": string,"display_order": number,"format_id": string,"id"?: string,"team_slot": number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"display_name"?: string,"display_order"?: number,"format_id"?: string,"id"?: string,"team_slot"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "format_positions_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    }
                  ]
                },"judge_format_qualifications": {
                  Row: {
                    "approved": boolean,"approved_at": string | null,"approved_by": string | null,"created_at": string,"format_id": string,"id": string,"judge_id": string,"updated_at": string
                  }
                  Insert: {
                    "approved"?: boolean,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"format_id": string,"id"?: string,"judge_id": string,"updated_at"?: string
                  }
                  Update: {
                    "approved"?: boolean,"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"format_id"?: string,"id"?: string,"judge_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "judge_format_qualifications_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "judge_format_qualifications_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "judge_format_qualifications_judge_id_fkey"
      columns: ["judge_id"]
isOneToOne: false
      referencedRelation: "judge_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"judge_profiles": {
                  Row: {
                    "approval_status": Database["public"]['Enums']["judge_approval_status"],"created_at": string,"experience_notes": string | null,"id": string,"paradigm": string | null,"profile_id": string,"updated_at": string
                  }
                  Insert: {
                    "approval_status"?: Database["public"]['Enums']["judge_approval_status"],"created_at"?: string,"experience_notes"?: string | null,"id"?: string,"paradigm"?: string | null,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "approval_status"?: Database["public"]['Enums']["judge_approval_status"],"created_at"?: string,"experience_notes"?: string | null,"id"?: string,"paradigm"?: string | null,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "judge_profiles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notices": {
                  Row: {
                    "audience_type": string,"body": string,"created_at": string,"created_by": string,"event_id": string | null,"expires_at": string | null,"format_id": string | null,"id": string,"published_at": string | null,"role": Database["public"]['Enums']["app_role"] | null,"title": string,"updated_at": string
                  }
                  Insert: {
                    "audience_type": string,"body": string,"created_at"?: string,"created_by": string,"event_id"?: string | null,"expires_at"?: string | null,"format_id"?: string | null,"id"?: string,"published_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"] | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "audience_type"?: string,"body"?: string,"created_at"?: string,"created_by"?: string,"event_id"?: string | null,"expires_at"?: string | null,"format_id"?: string | null,"id"?: string,"published_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"] | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notices_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notices_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notices_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    }
                  ]
                },"participations": {
                  Row: {
                    "created_at": string,"entitlement_type": Database["public"]['Enums']["entitlement_type"],"event_id": string,"format_id": string,"id": string,"participation_number": number,"rating_snapshot": number,"status": Database["public"]['Enums']["participation_status"],"student_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"entitlement_type"?: Database["public"]['Enums']["entitlement_type"],"event_id": string,"format_id": string,"id"?: string,"participation_number"?: number,"rating_snapshot": number,"status"?: Database["public"]['Enums']["participation_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"entitlement_type"?: Database["public"]['Enums']["entitlement_type"],"event_id"?: string,"format_id"?: string,"id"?: string,"participation_number"?: number,"rating_snapshot"?: number,"status"?: Database["public"]['Enums']["participation_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participations_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_requests": {
                  Row: {
                    "created_at": string,"event_id": string,"format_id": string | null,"id": string,"requested_student_id": string,"requester_student_id": string,"status": Database["public"]['Enums']["partner_request_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": string,"format_id"?: string | null,"id"?: string,"requested_student_id": string,"requester_student_id": string,"status"?: Database["public"]['Enums']["partner_request_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"format_id"?: string | null,"id"?: string,"requested_student_id"?: string,"requester_student_id"?: string,"status"?: Database["public"]['Enums']["partner_request_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_requests_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_requests_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_requests_requested_student_id_fkey"
      columns: ["requested_student_id"]
isOneToOne: false
      referencedRelation: "student_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_requests_requester_student_id_fkey"
      columns: ["requester_student_id"]
isOneToOne: false
      referencedRelation: "student_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string,"email": string,"first_name": string,"id": string,"last_name": string,"phone": string | null,"status": Database["public"]['Enums']["profile_status"],"updated_at": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name": string,"email": string,"first_name": string,"id": string,"last_name": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "bucket": string,"count": number,"created_at": string,"subject_hash": string,"updated_at": string,"window_start": string
                  }
                  Insert: {
                    "bucket": string,"count"?: number,"created_at"?: string,"subject_hash": string,"updated_at"?: string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"created_at"?: string,"subject_hash"?: string,"updated_at"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"registration_format_preferences": {
                  Row: {
                    "created_at": string,"format_id": string,"id": string,"preference_rank": number,"registration_id": string
                  }
                  Insert: {
                    "created_at"?: string,"format_id": string,"id"?: string,"preference_rank": number,"registration_id": string
                  }
                  Update: {
                    "created_at"?: string,"format_id"?: string,"id"?: string,"preference_rank"?: number,"registration_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "registration_format_preferences_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registration_format_preferences_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    }
                  ]
                },"registrations": {
                  Row: {
                    "cancelled_at": string | null,"check_in_method": Database["public"]['Enums']["check_in_method"] | null,"checked_in_at": string | null,"created_at": string,"event_id": string,"id": string,"registered_at": string,"status": Database["public"]['Enums']["registration_status"],"student_id": string,"updated_at": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"check_in_method"?: Database["public"]['Enums']["check_in_method"] | null,"checked_in_at"?: string | null,"created_at"?: string,"event_id": string,"id"?: string,"registered_at"?: string,"status"?: Database["public"]['Enums']["registration_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"check_in_method"?: Database["public"]['Enums']["check_in_method"] | null,"checked_in_at"?: string | null,"created_at"?: string,"event_id"?: string,"id"?: string,"registered_at"?: string,"status"?: Database["public"]['Enums']["registration_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "registrations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"student_format_profiles": {
                  Row: {
                    "created_at": string,"eligible": boolean,"format_id": string,"id": string,"rating": number | null,"student_id": string,"updated_at": string,"updated_by": string
                  }
                  Insert: {
                    "created_at"?: string,"eligible"?: boolean,"format_id": string,"id"?: string,"rating"?: number | null,"student_id": string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "created_at"?: string,"eligible"?: boolean,"format_id"?: string,"id"?: string,"rating"?: number | null,"student_id"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_format_profiles_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_format_profiles_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_format_profiles_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"student_profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"grade": string | null,"id": string,"notes": string | null,"partner_code": string,"profile_id": string,"school": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"grade"?: string | null,"id"?: string,"notes"?: string | null,"partner_code"?: string,"profile_id": string,"school"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"grade"?: string | null,"id"?: string,"notes"?: string | null,"partner_code"?: string,"profile_id"?: string,"school"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_profiles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"system_settings": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"key": string,"updated_at": string,"updated_by": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"key": string,"updated_at"?: string,"updated_by": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"key"?: string,"updated_at"?: string,"updated_by"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "system_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "created_at": string,"id": string,"is_ironman": boolean,"participation_id": string,"speaker_position": number | null,"team_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_ironman"?: boolean,"participation_id": string,"speaker_position"?: number | null,"team_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_ironman"?: boolean,"participation_id"?: string,"speaker_position"?: number | null,"team_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_participation_id_fkey"
      columns: ["participation_id"]
isOneToOne: false
      referencedRelation: "participations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_members_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "average_rating": number | null,"created_at": string,"event_id": string,"format_id": string,"id": string,"status": Database["public"]['Enums']["team_status"],"team_label": string | null,"updated_at": string
                  }
                  Insert: {
                    "average_rating"?: number | null,"created_at"?: string,"event_id": string,"format_id": string,"id"?: string,"status"?: Database["public"]['Enums']["team_status"],"team_label"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "average_rating"?: number | null,"created_at"?: string,"event_id"?: string,"format_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["team_status"],"team_label"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teams_format_id_fkey"
      columns: ["format_id"]
isOneToOne: false
      referencedRelation: "debate_formats"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"profile_id": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"profile_id": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"profile_id"?: string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "audit_is_sensitive_key":
{ Args: { "p_key": string }; Returns: boolean
                           },
"audit_redact":
{ Args: { "p_payload": Json }; Returns: Json
                           },
"consume_rate_limit":
{ Args: { "p_bucket": string,"p_max": number,"p_subject_hash": string,"p_window_seconds": number }; Returns: boolean
                           },
"current_profile_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"find_student_by_partner_code":
{ Args: { "p_code": string,"p_event": string }; Returns: {
              "display_name": string,"registered_for_event": boolean,"school": string,"student_id": string
            }[]
                           },
"generate_partner_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"has_role":
{ Args: { "target": Database["public"]['Enums']["app_role"] }; Returns: boolean
                           },
"is_event_registration_open":
{ Args: { "target_event": string }; Returns: boolean
                           },
"is_format_selectable_for_registration":
{ Args: { "target_format": string,"target_registration": string }; Returns: boolean
                           },
"is_judge":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_my_registration":
{ Args: { "target_registration": string }; Returns: boolean
                           },
"is_my_registration_open":
{ Args: { "target_registration": string }; Returns: boolean
                           },
"is_service_role":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_student":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_super_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_judge_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_student_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"prune_rate_limit_counters":
{ Args: { "p_keep_days"?: number }; Returns: number
                           }
          }
          Enums: {
            "app_role": "student"|"judge"|"coach"|"club_manager"|"super_admin","check_in_method": "self"|"admin","entitlement_type": "weekly_entitlement"|"extra_paid"|"extra_complimentary"|"extra_payment_pending","event_status": "draft"|"registration_open"|"registration_closed"|"pairing"|"ready"|"live"|"completed"|"archived"|"cancelled","judge_approval_status": "pending"|"approved"|"rejected"|"suspended","participation_status": "proposed"|"confirmed"|"completed"|"cancelled","partner_request_status": "pending"|"accepted"|"unavailable"|"replaced"|"cancelled","profile_status": "active"|"inactive"|"suspended","registration_status": "registered"|"cancelled"|"late_cancelled"|"checked_in"|"no_show","team_status": "proposed"|"confirmed"|"dissolved"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["student", "judge", "coach", "club_manager", "super_admin"],"check_in_method": ["self", "admin"],"entitlement_type": ["weekly_entitlement", "extra_paid", "extra_complimentary", "extra_payment_pending"],"event_status": ["draft", "registration_open", "registration_closed", "pairing", "ready", "live", "completed", "archived", "cancelled"],"judge_approval_status": ["pending", "approved", "rejected", "suspended"],"participation_status": ["proposed", "confirmed", "completed", "cancelled"],"partner_request_status": ["pending", "accepted", "unavailable", "replaced", "cancelled"],"profile_status": ["active", "inactive", "suspended"],"registration_status": ["registered", "cancelled", "late_cancelled", "checked_in", "no_show"],"team_status": ["proposed", "confirmed", "dissolved"]
          }
        }
} as const

