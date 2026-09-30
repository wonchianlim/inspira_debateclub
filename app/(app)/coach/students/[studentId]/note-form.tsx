"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { deleteCoachNoteAction, saveCoachNoteAction } from "@/lib/coach/note-actions";

/**
 * 教练私人笔记的读写界面。
 *
 * 界面上**明确写出"只有你自己能看到"** —— 教练需要知道这个边界，
 * 否则他会以为这是机构记录而不敢写不确定的观察，那正是这个功能存在的理由。
 */
export function CoachNotes({
  studentId,
  notes,
}: {
  studentId: string;
  notes: { noteId: string; body: string; createdAt: string }[];
}) {
  const [saveState, saveAction, saving] = useActionState(saveCoachNoteAction, INITIAL_FORM_STATE);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteCoachNoteAction,
    INITIAL_FORM_STATE,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        这些笔记**只有你自己能看到** —— 管理员和其他教练都看不到，学生也看不到。
        所以可以放心写还不确定的观察。
      </p>

      <form action={saveAction} className="flex flex-col gap-2">
        <input type="hidden" name="studentId" value={studentId} />
        {/*
          上方那段说明是段落文字、不是 label，因此这里必须显式给可访问名称。
          ⚠️ 注释写在标签**外面**：写在标签属性里时，注释中的尖括号
          会让静态检查误判标签边界（我踩过）。
        */}
        <textarea
          name="body"
          aria-label="给这位学生的私人笔记"
          rows={3}
          required
          disabled={saving}
          placeholder="例如：反驳时常常只重复自己的论点，需要练「先回应对方，再延伸自己」。"
          className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={saving} className="self-start">
          {saving ? "保存中…" : "添加笔记"}
        </Button>
        <FormMessage status={saveState.status} message={saveState.message} />
      </form>

      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">你还没有给这位学生写过笔记。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <div
              key={note.noteId}
              className="border-border flex flex-col gap-2 rounded-md border px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  只有你能看到
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {utcToZonedLocal(new Date(note.createdAt), CLUB_DEFAULT_TIMEZONE).replace(
                    "T",
                    " ",
                  )}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.body}</p>
              <form action={deleteAction}>
                <input type="hidden" name="noteId" value={note.noteId} />
                <input type="hidden" name="studentId" value={studentId} />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  disabled={deleting}
                  className="self-start"
                >
                  删除这条笔记
                </Button>
              </form>
            </div>
          ))}
          <FormMessage status={deleteState.status} message={deleteState.message} />
        </div>
      )}
    </div>
  );
}
