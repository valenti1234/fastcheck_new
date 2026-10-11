"""007 down · Rollback Bloque 2.5 Capacidad Pool"""
_MIGRATION_ID = "007"

async def down(db):
    # Drop collections nuevas
    for c in ["pool_creditos_organizacion", "usuario_limite_consumo_v2",
              "consumos_log_v2", "notificaciones_push"]:
        try:
            await db[c].drop()
        except Exception:
            pass

    # Elimina permisos pool.credit del catalogo
    await db["permisos"].delete_many({"codigo": {"$in": ["pool.credit.view", "pool.credit.manage"]}})

    # Elimina plantillas rol_permiso pool.credit
    await db["rol_permiso"].delete_many({"permiso_codigo": {"$regex": r"^pool\.credit\."}})

    # Actualiza state
    await db["__rbac_migrations_version"].update_one(
        {"_id": "state"},
        {"$pull": {"applied": _MIGRATION_ID}}
    )
    print(f"[007 down] OK. Rollback 4 colecciones y permisos pool.credit.*")
