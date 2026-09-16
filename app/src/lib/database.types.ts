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
      classes_etablissement: {
        Row: {
          etablissement_id: string
          id: string
          niveau: string
          nombre_classes: number
          updated_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          niveau: string
          nombre_classes?: number
          updated_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          niveau?: string
          nombre_classes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_etablissement_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      creneaux_horaires: {
        Row: {
          created_at: string
          cycle: string
          etablissement_id: string
          heure_debut: string
          heure_fin: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string
          cycle: string
          etablissement_id: string
          heure_debut: string
          heure_fin: string
          id?: string
          type: string
        }
        Update: {
          created_at?: string
          cycle?: string
          etablissement_id?: string
          heure_debut?: string
          heure_fin?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "creneaux_horaires_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      emploi_du_temps: {
        Row: {
          created_at: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id: string
          jour: string
          matiere: string
          niveau: string
          professeur_id: string
          salle: string | null
          section: number
        }
        Insert: {
          created_at?: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id?: string
          jour: string
          matiere: string
          niveau: string
          professeur_id: string
          salle?: string | null
          section: number
        }
        Update: {
          created_at?: string
          creneau_id?: string
          cycle?: string
          etablissement_id?: string
          id?: string
          jour?: string
          matiere?: string
          niveau?: string
          professeur_id?: string
          salle?: string | null
          section?: number
        }
        Relationships: [
          {
            foreignKeyName: "emploi_du_temps_creneau_id_fkey"
            columns: ["creneau_id"]
            isOneToOne: false
            referencedRelation: "creneaux_horaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emploi_du_temps_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emploi_du_temps_professeur_id_fkey"
            columns: ["professeur_id"]
            isOneToOne: false
            referencedRelation: "professeurs"
            referencedColumns: ["id"]
          },
        ]
      }
      etablissements: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      horaires_contraintes: {
        Row: {
          couleur_matieres: boolean
          creneau_egale_heure: boolean
          cycle: string
          etablissement_id: string
          id: string
          jours_cours: string[]
          mercredi_apres_midi_banalise: boolean
          updated_at: string
        }
        Insert: {
          couleur_matieres?: boolean
          creneau_egale_heure?: boolean
          cycle?: string
          etablissement_id: string
          id?: string
          jours_cours?: string[]
          mercredi_apres_midi_banalise?: boolean
          updated_at?: string
        }
        Update: {
          couleur_matieres?: boolean
          creneau_egale_heure?: boolean
          cycle?: string
          etablissement_id?: string
          id?: string
          jours_cours?: string[]
          mercredi_apres_midi_banalise?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horaires_contraintes_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      horaires_reference: {
        Row: {
          discipline: string
          etablissement_id: string
          id: string
          niveau: string
          updated_at: string
          valeur: string
        }
        Insert: {
          discipline: string
          etablissement_id: string
          id?: string
          niveau: string
          updated_at?: string
          valeur?: string
        }
        Update: {
          discipline?: string
          etablissement_id?: string
          id?: string
          niveau?: string
          updated_at?: string
          valeur?: string
        }
        Relationships: [
          {
            foreignKeyName: "horaires_reference_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      professeur_indisponibilites: {
        Row: {
          created_at: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id: string
          jour: string
          nom_complet: string
        }
        Insert: {
          created_at?: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id?: string
          jour: string
          nom_complet: string
        }
        Update: {
          created_at?: string
          creneau_id?: string
          cycle?: string
          etablissement_id?: string
          id?: string
          jour?: string
          nom_complet?: string
        }
        Relationships: [
          {
            foreignKeyName: "professeur_indisponibilites_creneau_id_fkey"
            columns: ["creneau_id"]
            isOneToOne: false
            referencedRelation: "creneaux_horaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professeur_indisponibilites_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      professeurs: {
        Row: {
          etablissement_id: string
          id: string
          matiere: string
          niveaux: string[]
          nom_complet: string
          remarque: string | null
          updated_at: string
          volume_horaire: number
        }
        Insert: {
          etablissement_id: string
          id?: string
          matiere: string
          niveaux?: string[]
          nom_complet: string
          remarque?: string | null
          updated_at?: string
          volume_horaire?: number
        }
        Update: {
          etablissement_id?: string
          id?: string
          matiere?: string
          niveaux?: string[]
          nom_complet?: string
          remarque?: string | null
          updated_at?: string
          volume_horaire?: number
        }
        Relationships: [
          {
            foreignKeyName: "professeurs_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          etablissement_id: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          etablissement_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          etablissement_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
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
