use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};

use crate::error::{DiornaError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StructuredSnapshot {
    pub workspaces: Vec<Workspace>,
    pub categories: Vec<Category>,
    pub courses: Vec<Course>,
    #[serde(default)]
    pub templates: Vec<StudyTemplate>,
    #[serde(default)]
    pub flashcards: Vec<Flashcard>,
    #[serde(default)]
    pub review_logs: Vec<ReviewLog>,
    #[serde(default)]
    pub references: Vec<Reference>,
    pub items: Vec<Item>,
    pub habits: Vec<Habit>,
    pub habit_entries: Vec<HabitEntry>,
    pub metrics: Vec<Metric>,
    pub metric_entries: Vec<MetricEntry>,
    pub recaps: Vec<Recap>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    id: String,
    name: String,
    color: String,
    folder_name: String,
    sort_order: i64,
    kind: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    id: String,
    workspace_id: String,
    name: String,
    color: String,
    icon: String,
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    id: String,
    workspace_id: String,
    name: String,
    code: String,
    color: String,
    semester: String,
    instructor: String,
    credits: f64,
    schedule: String,
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StudyTemplate {
    id: String,
    workspace_id: String,
    name: String,
    body: String,
    built_in: bool,
    default_course_id: Option<String>,
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Flashcard {
    id: String,
    workspace_id: String,
    note_id: String,
    block_id: String,
    front: String,
    back: String,
    card_type: String,
    ease: f64,
    interval_days: i64,
    due_date: String,
    reps: i64,
    lapses: i64,
    last_reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLog {
    id: String,
    workspace_id: String,
    flashcard_id: String,
    reviewed_at: String,
    grade: String,
    interval_before: i64,
    interval_after: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    id: String,
    workspace_id: String,
    citation_key: String,
    title: String,
    authors: Vec<String>,
    year: Option<i64>,
    container: Option<String>,
    doi: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    id: String,
    workspace_id: String,
    kind: String,
    title: String,
    description: String,
    category_id: String,
    start_at: Option<String>,
    end_at: Option<String>,
    all_day: bool,
    due_at: Option<String>,
    completed_at: Option<String>,
    priority: String,
    subtasks: Value,
    note_id: Option<String>,
    course_id: Option<String>,
    rrule: Option<String>,
    rrule_exceptions: Value,
    reminders: Vec<i64>,
    created_at: String,
    updated_at: String,
    trashed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    id: String,
    workspace_id: String,
    name: String,
    category_id: String,
    #[serde(rename = "type")]
    habit_type: String,
    unit: Option<String>,
    target: Option<f64>,
    active_weekdays: Vec<u8>,
    start_date: Option<String>,
    end_date: Option<String>,
    description: String,
    sort_order: i64,
    archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitEntry {
    workspace_id: String,
    habit_id: String,
    date: String,
    done: bool,
    value: Option<f64>,
    note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    id: String,
    workspace_id: String,
    name: String,
    unit: String,
    category_id: String,
    target: Option<f64>,
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MetricEntry {
    workspace_id: String,
    metric_id: String,
    date: String,
    value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recap {
    id: String,
    workspace_id: String,
    period_type: String,
    period_start: String,
    period_end: String,
    note_id: String,
    stats: Value,
    narrative: String,
    model_used: String,
    generated_at: String,
    revision: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedStructuredState {
    pub initialized: bool,
    pub snapshot: StructuredSnapshot,
}

pub async fn persist(pool: &SqlitePool, snapshot: StructuredSnapshot) -> Result<()> {
    let mut tx = pool.begin().await?;
    for value in &snapshot.workspaces {
        sqlx::query("INSERT INTO workspace(id,name,color,folder_name,sort_order,created_at,kind) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,folder_name=excluded.folder_name,sort_order=excluded.sort_order,kind=excluded.kind")
            .bind(&value.id).bind(&value.name).bind(&value.color).bind(&value.folder_name)
            .bind(value.sort_order).bind(&value.created_at).bind(&value.kind).execute(&mut *tx).await?;
    }
    for value in &snapshot.categories {
        sqlx::query("INSERT INTO category(id,workspace_id,name,color,icon,sort_order) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,icon=excluded.icon,sort_order=excluded.sort_order")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.name).bind(&value.color)
            .bind(&value.icon).bind(value.sort_order).execute(&mut *tx).await?;
    }
    for value in &snapshot.courses {
        sqlx::query("INSERT INTO course(id,workspace_id,name,code,color,semester,instructor,credits,schedule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,color=excluded.color,semester=excluded.semester,instructor=excluded.instructor,credits=excluded.credits,schedule=excluded.schedule,sort_order=excluded.sort_order")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.name).bind(&value.code)
            .bind(&value.color).bind(&value.semester).bind(&value.instructor).bind(value.credits)
            .bind(&value.schedule).bind(value.sort_order).execute(&mut *tx).await?;
    }
    for value in &snapshot.templates {
        let default_course_id = existing_id(
            &mut tx,
            "course",
            &value.workspace_id,
            value.default_course_id.as_deref(),
        )
        .await?;
        sqlx::query("INSERT INTO study_template(id,workspace_id,name,body,built_in,default_course_id,sort_order) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,body=excluded.body,built_in=excluded.built_in,default_course_id=excluded.default_course_id,sort_order=excluded.sort_order")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.name).bind(&value.body)
            .bind(value.built_in).bind(default_course_id).bind(value.sort_order).execute(&mut *tx).await?;
    }
    for value in &snapshot.flashcards {
        if existing_id(&mut tx, "note", &value.workspace_id, Some(&value.note_id))
            .await?
            .is_none()
        {
            continue;
        }
        sqlx::query("INSERT INTO flashcard(id,workspace_id,note_id,block_id,front,back,card_type,ease,interval_days,due_date,reps,lapses,last_reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET front=excluded.front,back=excluded.back,card_type=excluded.card_type,ease=excluded.ease,interval_days=excluded.interval_days,due_date=excluded.due_date,reps=excluded.reps,lapses=excluded.lapses,last_reviewed_at=excluded.last_reviewed_at")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.note_id).bind(&value.block_id)
            .bind(&value.front).bind(&value.back).bind(&value.card_type).bind(value.ease)
            .bind(value.interval_days).bind(&value.due_date).bind(value.reps).bind(value.lapses)
            .bind(&value.last_reviewed_at).execute(&mut *tx).await?;
    }
    for value in &snapshot.review_logs {
        if sqlx::query("SELECT id FROM flashcard WHERE workspace_id=? AND id=?")
            .bind(&value.workspace_id)
            .bind(&value.flashcard_id)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            continue;
        }
        sqlx::query("INSERT INTO review_log(id,workspace_id,flashcard_id,reviewed_at,grade,interval_before,interval_after) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.flashcard_id).bind(&value.reviewed_at)
            .bind(&value.grade).bind(value.interval_before).bind(value.interval_after).execute(&mut *tx).await?;
    }
    for value in &snapshot.references {
        let data = json_text(
            &serde_json::to_value(value)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
        )?;
        sqlx::query("INSERT INTO reference(id,workspace_id,citation_key,csl_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET citation_key=excluded.citation_key,csl_json=excluded.csl_json")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.citation_key).bind(data).execute(&mut *tx).await?;
    }
    for value in &snapshot.items {
        let note_id = existing_id(
            &mut tx,
            "note",
            &value.workspace_id,
            value.note_id.as_deref(),
        )
        .await?;
        let course_id = existing_id(
            &mut tx,
            "course",
            &value.workspace_id,
            value.course_id.as_deref(),
        )
        .await?;
        sqlx::query("INSERT INTO item(id,workspace_id,kind,title,description,category_id,start_at,end_at,all_day,due_at,completed_at,priority,subtasks_json,rrule,rrule_exceptions,note_id,course_id,created_at,updated_at,trashed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,description=excluded.description,category_id=excluded.category_id,start_at=excluded.start_at,end_at=excluded.end_at,all_day=excluded.all_day,due_at=excluded.due_at,completed_at=excluded.completed_at,priority=excluded.priority,subtasks_json=excluded.subtasks_json,rrule=excluded.rrule,rrule_exceptions=excluded.rrule_exceptions,note_id=excluded.note_id,course_id=excluded.course_id,updated_at=excluded.updated_at,trashed_at=excluded.trashed_at")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.kind).bind(&value.title)
            .bind(&value.description).bind(&value.category_id).bind(&value.start_at).bind(&value.end_at)
            .bind(value.all_day).bind(&value.due_at).bind(&value.completed_at).bind(&value.priority)
            .bind(json_text(&value.subtasks)?).bind(&value.rrule)
            .bind(json_text(&value.rrule_exceptions)?).bind(note_id).bind(course_id)
            .bind(&value.created_at).bind(&value.updated_at).bind(&value.trashed_at).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM item_reminder WHERE workspace_id=? AND item_id=?")
            .bind(&value.workspace_id)
            .bind(&value.id)
            .execute(&mut *tx)
            .await?;
        for minutes in &value.reminders {
            sqlx::query(
                "INSERT INTO item_reminder(id,workspace_id,item_id,minutes_before) VALUES(?,?,?,?)",
            )
            .bind(format!("{}:{minutes}", value.id))
            .bind(&value.workspace_id)
            .bind(&value.id)
            .bind(minutes)
            .execute(&mut *tx)
            .await?;
        }
    }
    for value in &snapshot.habits {
        let weekdays = value
            .active_weekdays
            .iter()
            .fold(0_i64, |mask, day| mask | (1_i64 << day));
        sqlx::query("INSERT INTO habit(id,workspace_id,name,category_id,type,unit,target,active_weekdays,start_date,end_date,description,sort_order,archived) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,type=excluded.type,unit=excluded.unit,target=excluded.target,active_weekdays=excluded.active_weekdays,start_date=excluded.start_date,end_date=excluded.end_date,description=excluded.description,sort_order=excluded.sort_order,archived=excluded.archived")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.name).bind(&value.category_id)
            .bind(&value.habit_type).bind(&value.unit).bind(value.target).bind(weekdays)
            .bind(&value.start_date).bind(&value.end_date).bind(&value.description)
            .bind(value.sort_order).bind(value.archived).execute(&mut *tx).await?;
    }
    for value in &snapshot.habit_entries {
        sqlx::query("INSERT INTO habit_entry(workspace_id,habit_id,date,done,value,note) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,habit_id,date) DO UPDATE SET done=excluded.done,value=excluded.value,note=excluded.note")
            .bind(&value.workspace_id).bind(&value.habit_id).bind(&value.date).bind(value.done)
            .bind(value.value).bind(&value.note).execute(&mut *tx).await?;
    }
    for value in &snapshot.metrics {
        sqlx::query("INSERT INTO metric(id,workspace_id,name,unit,category_id,target,sort_order) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,unit=excluded.unit,category_id=excluded.category_id,target=excluded.target,sort_order=excluded.sort_order")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.name).bind(&value.unit)
            .bind(&value.category_id).bind(value.target).bind(value.sort_order).execute(&mut *tx).await?;
    }
    for value in &snapshot.metric_entries {
        sqlx::query("INSERT INTO metric_entry(workspace_id,metric_id,date,value) VALUES(?,?,?,?) ON CONFLICT(workspace_id,metric_id,date) DO UPDATE SET value=excluded.value")
            .bind(&value.workspace_id).bind(&value.metric_id).bind(&value.date).bind(value.value)
            .execute(&mut *tx).await?;
    }
    for value in &snapshot.recaps {
        if existing_id(&mut tx, "note", &value.workspace_id, Some(&value.note_id))
            .await?
            .is_none()
        {
            continue;
        }
        sqlx::query("INSERT INTO recap(id,workspace_id,period_type,period_start,period_end,note_id,stats_json,narrative,model_used,generated_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET stats_json=excluded.stats_json,narrative=excluded.narrative,model_used=excluded.model_used,generated_at=excluded.generated_at,revision=excluded.revision")
            .bind(&value.id).bind(&value.workspace_id).bind(&value.period_type).bind(&value.period_start)
            .bind(&value.period_end).bind(&value.note_id).bind(json_text(&value.stats)?)
            .bind(&value.narrative).bind(&value.model_used).bind(&value.generated_at).bind(value.revision)
            .execute(&mut *tx).await?;
    }
    sqlx::query("INSERT INTO app_meta(key,value) VALUES('structured_initialized','1') ON CONFLICT(key) DO UPDATE SET value='1'")
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn load(pool: &SqlitePool) -> Result<LoadedStructuredState> {
    let initialized = sqlx::query("SELECT value FROM app_meta WHERE key='structured_initialized'")
        .fetch_optional(pool)
        .await?
        .is_some();
    let workspaces = sqlx::query_as::<_, Workspace>("SELECT id,name,color,folder_name,sort_order,kind,created_at FROM workspace ORDER BY sort_order")
        .fetch_all(pool).await?;
    let categories = sqlx::query_as::<_, Category>("SELECT id,workspace_id,name,color,icon,sort_order FROM category ORDER BY workspace_id,sort_order")
        .fetch_all(pool).await?;
    let courses = sqlx::query_as::<_, Course>("SELECT id,workspace_id,name,code,color,semester,instructor,credits,schedule,sort_order FROM course ORDER BY workspace_id,sort_order")
        .fetch_all(pool).await?;
    let templates = sqlx::query_as::<_, StudyTemplate>("SELECT id,workspace_id,name,body,built_in,default_course_id,sort_order FROM study_template ORDER BY workspace_id,sort_order")
        .fetch_all(pool).await?;
    let flashcards = sqlx::query_as::<_, Flashcard>("SELECT id,workspace_id,note_id,block_id,front,back,card_type,ease,interval_days,due_date,reps,lapses,last_reviewed_at FROM flashcard ORDER BY workspace_id,due_date")
        .fetch_all(pool).await?;
    let review_logs = sqlx::query_as::<_, ReviewLog>("SELECT id,workspace_id,flashcard_id,reviewed_at,grade,interval_before,interval_after FROM review_log ORDER BY reviewed_at")
        .fetch_all(pool).await?;
    let mut references = Vec::new();
    for row in sqlx::query("SELECT csl_json FROM reference ORDER BY workspace_id,citation_key")
        .fetch_all(pool)
        .await?
    {
        references.push(
            serde_json::from_str::<Reference>(&row.get::<String, _>("csl_json"))
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
        );
    }
    let metrics = sqlx::query_as::<_, Metric>("SELECT id,workspace_id,name,unit,category_id,target,sort_order FROM metric ORDER BY workspace_id,sort_order")
        .fetch_all(pool).await?;
    let metric_entries = sqlx::query_as::<_, MetricEntry>(
        "SELECT workspace_id,metric_id,date,value FROM metric_entry ORDER BY date",
    )
    .fetch_all(pool)
    .await?;

    let reminder_rows =
        sqlx::query("SELECT item_id,minutes_before FROM item_reminder ORDER BY minutes_before")
            .fetch_all(pool)
            .await?;
    let mut reminder_map = std::collections::HashMap::<String, Vec<i64>>::new();
    for row in reminder_rows {
        reminder_map
            .entry(row.get("item_id"))
            .or_default()
            .push(row.get("minutes_before"));
    }
    let mut items = Vec::new();
    for row in sqlx::query("SELECT id,workspace_id,kind,title,description,category_id,start_at,end_at,all_day,due_at,completed_at,priority,subtasks_json,note_id,course_id,rrule,rrule_exceptions,created_at,updated_at,trashed_at FROM item ORDER BY created_at")
        .fetch_all(pool).await? {
        let id: String = row.get("id");
        items.push(Item {
            reminders: reminder_map.remove(&id).unwrap_or_default(),
            id,
            workspace_id: row.get("workspace_id"), kind: row.get("kind"), title: row.get("title"),
            description: row.get("description"), category_id: row.get("category_id"),
            start_at: row.get("start_at"), end_at: row.get("end_at"), all_day: row.get::<i64,_>("all_day") != 0,
            due_at: row.get("due_at"), completed_at: row.get("completed_at"), priority: row.get("priority"),
            subtasks: parse_json(row.get::<String,_>("subtasks_json"))?, note_id: row.get("note_id"),
            course_id: row.get("course_id"), rrule: row.get("rrule"),
            rrule_exceptions: parse_json(row.get::<String,_>("rrule_exceptions"))?,
            created_at: row.get("created_at"), updated_at: row.get("updated_at"), trashed_at: row.get("trashed_at"),
        });
    }
    let mut habits = Vec::new();
    for row in sqlx::query("SELECT id,workspace_id,name,category_id,type,unit,target,active_weekdays,start_date,end_date,description,sort_order,archived FROM habit ORDER BY workspace_id,sort_order")
        .fetch_all(pool).await? {
        let mask: i64 = row.get("active_weekdays");
        habits.push(Habit {
            id: row.get("id"), workspace_id: row.get("workspace_id"), name: row.get("name"),
            category_id: row.get("category_id"), habit_type: row.get("type"), unit: row.get("unit"),
            target: row.get("target"), active_weekdays: (0..7).filter(|day| mask & (1_i64 << day) != 0).map(|day| day as u8).collect(),
            start_date: row.get("start_date"), end_date: row.get("end_date"), description: row.get("description"),
            sort_order: row.get("sort_order"), archived: row.get::<i64,_>("archived") != 0,
        });
    }
    let habit_entries = sqlx::query(
        "SELECT workspace_id,habit_id,date,done,value,note FROM habit_entry ORDER BY date",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| HabitEntry {
        workspace_id: row.get("workspace_id"),
        habit_id: row.get("habit_id"),
        date: row.get("date"),
        done: row.get::<i64, _>("done") != 0,
        value: row.get("value"),
        note: row.get("note"),
    })
    .collect();
    let mut recaps = Vec::new();
    for row in sqlx::query("SELECT id,workspace_id,period_type,period_start,period_end,note_id,stats_json,narrative,model_used,generated_at,revision FROM recap ORDER BY generated_at")
        .fetch_all(pool).await? {
        recaps.push(Recap {
            id: row.get("id"), workspace_id: row.get("workspace_id"), period_type: row.get("period_type"),
            period_start: row.get("period_start"), period_end: row.get("period_end"), note_id: row.get("note_id"),
            stats: parse_json(row.get::<String,_>("stats_json"))?, narrative: row.get("narrative"),
            model_used: row.get("model_used"), generated_at: row.get("generated_at"), revision: row.get("revision"),
        });
    }
    Ok(LoadedStructuredState {
        initialized,
        snapshot: StructuredSnapshot {
            workspaces,
            categories,
            courses,
            templates,
            flashcards,
            review_logs,
            references,
            items,
            habits,
            habit_entries,
            metrics,
            metric_entries,
            recaps,
        },
    })
}

fn json_text(value: &Value) -> Result<String> {
    serde_json::to_string(value).map_err(|error| DiornaError::InvalidData(error.to_string()))
}

fn parse_json(text: String) -> Result<Value> {
    serde_json::from_str(&text).map_err(|error| DiornaError::InvalidData(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{SaveNoteInput, Vault};

    #[tokio::test]
    async fn structured_state_round_trips_through_sqlite() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        assert!(!load(&vault.pool).await.unwrap().initialized);
        vault
            .save_note(SaveNoteInput {
                id: Some("note-study".into()),
                workspace_id: "workspace-personal".into(),
                relative_path: "Study.md".into(),
                title: "Study".into(),
                markdown: "A {{c1::card}}".into(),
                course_id: None,
                tags: vec![],
                properties: serde_json::json!({}),
                starred: false,
                expected_hash: None,
            })
            .await
            .unwrap();
        let snapshot = StructuredSnapshot {
            workspaces: vec![Workspace {
                id: "workspace-personal".into(),
                name: "Personal".into(),
                color: "#168a68".into(),
                folder_name: "Personal".into(),
                sort_order: 1,
                kind: "personal".into(),
                created_at: "2026-07-22T00:00:00Z".into(),
            }],
            categories: vec![Category {
                id: "workspace-personal-sport".into(),
                workspace_id: "workspace-personal".into(),
                name: "Sport".into(),
                color: "#168a68".into(),
                icon: "Dumbbell".into(),
                sort_order: 0,
            }],
            items: vec![Item {
                id: "item-training".into(),
                workspace_id: "workspace-personal".into(),
                kind: "task".into(),
                title: "Training".into(),
                description: String::new(),
                category_id: "workspace-personal-sport".into(),
                start_at: None,
                end_at: None,
                all_day: false,
                due_at: Some("2026-07-22T18:00:00Z".into()),
                completed_at: None,
                priority: "high".into(),
                subtasks: serde_json::json!([]),
                note_id: None,
                course_id: None,
                rrule: None,
                rrule_exceptions: serde_json::json!([]),
                reminders: vec![15],
                created_at: "2026-07-22T00:00:00Z".into(),
                updated_at: "2026-07-22T00:00:00Z".into(),
                trashed_at: None,
            }],
            templates: vec![StudyTemplate {
                id: "template-test".into(),
                workspace_id: "workspace-personal".into(),
                name: "Test".into(),
                body: "<p>{{cursor}}</p>".into(),
                built_in: false,
                default_course_id: None,
                sort_order: 0,
            }],
            flashcards: vec![Flashcard {
                id: "card-test".into(),
                workspace_id: "workspace-personal".into(),
                note_id: "note-study".into(),
                block_id: "cloze-1".into(),
                front: "A […]".into(),
                back: "card".into(),
                card_type: "cloze".into(),
                ease: 2.5,
                interval_days: 1,
                due_date: "2026-07-23".into(),
                reps: 1,
                lapses: 0,
                last_reviewed_at: None,
            }],
            review_logs: vec![ReviewLog {
                id: "review-test".into(),
                workspace_id: "workspace-personal".into(),
                flashcard_id: "card-test".into(),
                reviewed_at: "2026-07-22T12:00:00Z".into(),
                grade: "good".into(),
                interval_before: 0,
                interval_after: 1,
            }],
            references: vec![Reference {
                id: "reference-test".into(),
                workspace_id: "workspace-personal".into(),
                citation_key: "smith2026".into(),
                title: "Local first".into(),
                authors: vec!["Smith, Jane".into()],
                year: Some(2026),
                container: None,
                doi: None,
                url: None,
            }],
            ..StructuredSnapshot::default()
        };
        persist(&vault.pool, snapshot).await.unwrap();
        let loaded = load(&vault.pool).await.unwrap();
        assert!(loaded.initialized);
        assert_eq!(loaded.snapshot.items.len(), 1);
        assert_eq!(loaded.snapshot.items[0].reminders, vec![15]);
        assert_eq!(loaded.snapshot.items[0].id, "item-training");
        assert_eq!(loaded.snapshot.templates[0].id, "template-test");
        assert_eq!(loaded.snapshot.flashcards[0].id, "card-test");
        assert_eq!(loaded.snapshot.review_logs[0].grade, "good");
        assert_eq!(loaded.snapshot.references[0].citation_key, "smith2026");
    }
}

async fn existing_id(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    workspace_id: &str,
    id: Option<&str>,
) -> Result<Option<String>> {
    let Some(id) = id else { return Ok(None) };
    let query = match table {
        "note" => "SELECT id FROM note WHERE workspace_id=? AND id=?",
        "course" => "SELECT id FROM course WHERE workspace_id=? AND id=?",
        _ => {
            return Err(DiornaError::InvalidData(
                "Unsupported relationship table".into(),
            ));
        }
    };
    Ok(sqlx::query(query)
        .bind(workspace_id)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .map(|row| row.get::<String, _>(0)))
}
