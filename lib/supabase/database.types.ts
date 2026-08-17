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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_game_plans: {
        Row: {
          created_at: string
          game_id: string
          id: string
          model: string
          payload_json: Json
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          model: string
          payload_json: Json
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          model?: string
          payload_json?: Json
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_game_plans_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_game_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          icon_url: string | null
          id: string
          name: string
          np_comm_id: string | null
          platform: string | null
          source: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          icon_url?: string | null
          id?: string
          name: string
          np_comm_id?: string | null
          platform?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          np_comm_id?: string | null
          platform?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_steps: {
        Row: {
          content: string
          created_at: string
          guide_id: string
          id: string
          step_order: number
          trophy_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          guide_id: string
          id?: string
          step_order: number
          trophy_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          guide_id?: string
          id?: string
          step_order?: number
          trophy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_steps_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_steps_trophy_id_fkey"
            columns: ["trophy_id"]
            isOneToOne: false
            referencedRelation: "trophies"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          author_id: string
          content_markdown: string | null
          created_at: string
          external_url: string | null
          game_id: string
          id: string
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content_markdown?: string | null
          created_at?: string
          external_url?: string | null
          game_id: string
          id?: string
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content_markdown?: string | null
          created_at?: string
          external_url?: string | null
          game_id?: string
          id?: string
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guides_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guides_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      psn_accounts: {
        Row: {
          account_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          npsso_encrypted: string
          online_id: string
          token_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          npsso_encrypted: string
          online_id: string
          token_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          npsso_encrypted?: string
          online_id?: string
          token_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "psn_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trophies: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          game_id: string
          hidden: boolean
          icon_url: string | null
          id: string
          name: string
          sort_order: number | null
          trophy_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          game_id: string
          hidden?: boolean
          icon_url?: string | null
          id?: string
          name: string
          sort_order?: number | null
          trophy_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          game_id?: string
          hidden?: boolean
          icon_url?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          trophy_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "trophies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trophies_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_games: {
        Row: {
          added_at: string
          game_id: string
          id: string
          last_played_at: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          game_id: string
          id?: string
          last_played_at?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          game_id?: string
          id?: string
          last_played_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_games_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_guide_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          guide_step_id: string
          id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          guide_step_id: string
          id?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          guide_step_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_guide_progress_guide_step_id_fkey"
            columns: ["guide_step_id"]
            isOneToOne: false
            referencedRelation: "guide_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_guide_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_trophies: {
        Row: {
          created_at: string
          id: string
          trophy_id: string
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          trophy_id: string
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          trophy_id?: string
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_trophies_trophy_id_fkey"
            columns: ["trophy_id"]
            isOneToOne: false
            referencedRelation: "trophies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_trophies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
