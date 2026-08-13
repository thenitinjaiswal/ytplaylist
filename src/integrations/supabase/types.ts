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
      activities: {
        Row: {
          course_id: string | null
          created_at: string
          day: string
          id: string
          kind: string
          lesson_id: string | null
          meta: Json | null
          seconds: number
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          day?: string
          id?: string
          kind: string
          lesson_id?: string | null
          meta?: Json | null
          seconds?: number
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          day?: string
          id?: string
          kind?: string
          lesson_id?: string | null
          meta?: Json | null
          seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      code_files: {
        Row: {
          content: string
          course_id: string | null
          created_at: string
          id: string
          language: string
          lesson_id: string | null
          path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          course_id?: string | null
          created_at?: string
          id?: string
          language?: string
          lesson_id?: string | null
          path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          course_id?: string | null
          created_at?: string
          id?: string
          language?: string
          lesson_id?: string | null
          path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_files_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      code_versions: {
        Row: {
          created_at: string
          files: Json
          id: string
          label: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          files: Json
          id?: string
          label: string
          lesson_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          files?: Json
          id?: string
          label?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_versions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      commits: {
        Row: {
          created_at: string
          file_count: number
          html_url: string | null
          id: string
          lesson_id: string | null
          message: string
          repo_id: string
          sha: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_count?: number
          html_url?: string | null
          id?: string
          lesson_id?: string | null
          message: string
          repo_id: string
          sha?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_count?: number
          html_url?: string | null
          id?: string
          lesson_id?: string | null
          message?: string
          repo_id?: string
          sha?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commits_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commits_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "github_repos"
            referencedColumns: ["id"]
          },
        ]
      }
      course_schedules: {
        Row: {
          course_id: string
          id: string
          minutes: number
          playback_speed: number
          user_id: string
          weekday: number
        }
        Insert: {
          course_id: string
          id?: string
          minutes?: number
          playback_speed?: number
          user_id: string
          weekday: number
        }
        Update: {
          course_id?: string
          id?: string
          minutes?: number
          playback_speed?: number
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_schedules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          archived: boolean
          channel_title: string | null
          created_at: string
          description: string | null
          id: string
          playlist_id: string
          thumbnail_url: string | null
          title: string
          total_seconds: number
          updated_at: string
          user_id: string
          video_count: number
        }
        Insert: {
          archived?: boolean
          channel_title?: string | null
          created_at?: string
          description?: string | null
          id?: string
          playlist_id: string
          thumbnail_url?: string | null
          title: string
          total_seconds?: number
          updated_at?: string
          user_id: string
          video_count?: number
        }
        Update: {
          archived?: boolean
          channel_title?: string | null
          created_at?: string
          description?: string | null
          id?: string
          playlist_id?: string
          thumbnail_url?: string | null
          title?: string
          total_seconds?: number
          updated_at?: string
          user_id?: string
          video_count?: number
        }
        Relationships: []
      }
      github_connections: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          login: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          created_at?: string
          login: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          login?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_repos: {
        Row: {
          course_id: string | null
          created_at: string
          default_branch: string
          full_name: string
          html_url: string
          id: string
          is_private: boolean
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          default_branch?: string
          full_name: string
          html_url: string
          id?: string
          is_private?: boolean
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          default_branch?: string
          full_name?: string
          html_url?: string
          id?: string
          is_private?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_repos_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          course_id: string
          duration_seconds: number
          id: string
          last_position: number
          last_watched_at: string
          lesson_id: string
          updated_at: string
          user_id: string
          watched_seconds: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          course_id: string
          duration_seconds?: number
          id?: string
          last_position?: number
          last_watched_at?: string
          lesson_id: string
          updated_at?: string
          user_id: string
          watched_seconds?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          course_id?: string
          duration_seconds?: number
          id?: string
          last_position?: number
          last_watched_at?: string
          lesson_id?: string
          updated_at?: string
          user_id?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_seconds: number
          id: string
          position: number
          starter_code: string | null
          thumbnail_url: string | null
          title: string
          unavailable: boolean
          user_id: string
          video_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          position?: number
          starter_code?: string | null
          thumbnail_url?: string | null
          title: string
          unavailable?: boolean
          user_id: string
          video_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          position?: number
          starter_code?: string | null
          thumbnail_url?: string | null
          title?: string
          unavailable?: boolean
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          course_id: string | null
          created_at: string
          id: string
          lesson_id: string | null
          scope: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          course_id?: string | null
          created_at?: string
          id?: string
          lesson_id?: string | null
          scope?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          course_id?: string | null
          created_at?: string
          id?: string
          lesson_id?: string | null
          scope?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      preferences: {
        Row: {
          autosave: boolean
          daily_target_minutes: number
          default_language: string
          default_layout: string
          editor_font_size: number
          editor_tab_size: number
          minimap: boolean
          playback_speed: number
          theme: string
          updated_at: string
          user_id: string
          word_wrap: boolean
        }
        Insert: {
          autosave?: boolean
          daily_target_minutes?: number
          default_language?: string
          default_layout?: string
          editor_font_size?: number
          editor_tab_size?: number
          minimap?: boolean
          playback_speed?: number
          theme?: string
          updated_at?: string
          user_id: string
          word_wrap?: boolean
        }
        Update: {
          autosave?: boolean
          daily_target_minutes?: number
          default_language?: string
          default_layout?: string
          editor_font_size?: number
          editor_tab_size?: number
          minimap?: boolean
          playback_speed?: number
          theme?: string
          updated_at?: string
          user_id?: string
          word_wrap?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          github_login: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_login?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_login?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      snippets: {
        Row: {
          code: string
          course_id: string | null
          created_at: string
          id: string
          language: string
          lesson_id: string | null
          seconds: number | null
          title: string
          user_id: string
        }
        Insert: {
          code: string
          course_id?: string | null
          created_at?: string
          id?: string
          language?: string
          lesson_id?: string | null
          seconds?: number | null
          title?: string
          user_id: string
        }
        Update: {
          code?: string
          course_id?: string | null
          created_at?: string
          id?: string
          language?: string
          lesson_id?: string | null
          seconds?: number | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snippets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snippets_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      timestamp_notes: {
        Row: {
          body: string
          course_id: string
          created_at: string
          id: string
          lesson_id: string
          seconds: number
          user_id: string
        }
        Insert: {
          body: string
          course_id: string
          created_at?: string
          id?: string
          lesson_id: string
          seconds?: number
          user_id: string
        }
        Update: {
          body?: string
          course_id?: string
          created_at?: string
          id?: string
          lesson_id?: string
          seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timestamp_notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timestamp_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
