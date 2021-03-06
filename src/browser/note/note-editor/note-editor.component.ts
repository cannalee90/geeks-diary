import { DOWN_ARROW, ENTER } from '@angular/cdk/keycodes';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { FormControl } from '@angular/forms';
import { select, Store } from '@ngrx/store';
import { from, Observable, of, Subscription } from 'rxjs';
import { catchError, debounceTime, filter, switchMap, take, withLatestFrom } from 'rxjs/operators';
import { AssetTypes } from '../../../core/asset';
import { NoteSnippetTypes } from '../../../core/note';
import { toPromise } from '../../../libs/rx';
import { MenuEvent, MenuService, NativeDialog, nativeDialogFileFilters, NativeDialogProperties } from '../../shared';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { NoteCollectionService } from '../note-collection';
import { NoteContentFileAlreadyExistsError } from '../note-errors';
import { NoteStateWithRoot } from '../note.state';
import { NoteCodeSnippetActionDialog } from './note-code-snippet-action-dialog/note-code-snippet-action-dialog';
import { NoteSnippetContent } from './note-content.model';
import { NoteEditorService } from './note-editor.service';
import { NoteEditorState } from './note-editor.state';
import {
    NoteSnippetEditorInsertImageEvent,
    NoteSnippetEditorNewSnippetEvent,
    NoteSnippetEditorRef,
} from './note-snippet-editor';
import { NoteSnippetListManager } from './note-snippet-list-manager';


@Component({
    selector: 'gd-note-editor',
    templateUrl: './note-editor.component.html',
    styleUrls: ['./note-editor.component.scss'],
})
export class NoteEditorComponent implements OnInit, OnDestroy {
    private get filteredMenuMessages(): Observable<MenuEvent> {
        return this.menu.onMessage().pipe(
            filter(event => [
                MenuEvent.NEW_CODE_SNIPPET,
                MenuEvent.NEW_TEXT_SNIPPET,
                MenuEvent.INSERT_IMAGE,
            ].includes(event)),
        );
    }

    readonly titleInputControl = new FormControl('');

    @ViewChild('scrollable') scrollable: ElementRef<HTMLElement>;
    @ViewChild('snippetsList') snippetsList: ElementRef<HTMLElement>;
    @ViewChild('titleTextarea') titleTextarea: ElementRef<HTMLTextAreaElement>;

    private listTopFocusOutSubscription = Subscription.EMPTY;
    private menuMessageSubscription = Subscription.EMPTY;
    private titleChangeSubscription = Subscription.EMPTY;
    private selectedNoteTitleChangedSubscription = Subscription.EMPTY;

    constructor(
        private snippetListManager: NoteSnippetListManager,
        public _viewContainerRef: ViewContainerRef,
        private menu: MenuService,
        private store: Store<NoteStateWithRoot>,
        private actionDialog: NoteCodeSnippetActionDialog,
        private nativeDialog: NativeDialog,
        private editorService: NoteEditorService,
        private collectionService: NoteCollectionService,
        private confirmDialog: ConfirmDialog,
    ) {
    }

    ngOnInit(): void {
        this.snippetListManager
            .setContainerElement(this.snippetsList.nativeElement)
            .setViewContainerRef(this._viewContainerRef);

        this.listTopFocusOutSubscription = this.snippetListManager.topFocusOut()
            .subscribe(() => {
                if (this.titleTextarea) {
                    this.titleTextarea.nativeElement.focus();
                }
            });

        this.menuMessageSubscription = this.filteredMenuMessages.pipe(
            withLatestFrom(this.store.pipe(select(state => state.note.editor))),
        ).subscribe(([event, editorState]) => {
            const { activeSnippetIndex } = editorState as NoteEditorState;

            if (activeSnippetIndex === null) {
                return;
            }

            const ref = this.snippetListManager.getSnippetRefByIndex(activeSnippetIndex);

            // If snippet is not exists, just ignore.
            if (!ref) {
                return;
            }

            switch (event as MenuEvent) {
                case MenuEvent.NEW_TEXT_SNIPPET:
                    this.createNewTextSnippet(ref);
                    break;

                case MenuEvent.NEW_CODE_SNIPPET:
                    this.createNewCodeSnippet(ref);
                    break;

                case MenuEvent.INSERT_IMAGE:
                    this.insertImageAtSnippet(ref);
                    break;
            }
        });

        this.selectedNoteTitleChangedSubscription = this.store.pipe(
            select(state => state.note.collection.selectedNote),
            filter(selectedNote => !!selectedNote),
        ).subscribe((note) => {
            this.titleInputControl.setValue(note.title, { emitEvent: false });
        });

        this.titleChangeSubscription = this.titleInputControl.valueChanges.pipe(
            debounceTime(250),
            withLatestFrom(this.store.pipe(
                select(state => state.note.collection.selectedNote),
            )),
            switchMap(([newTitle, note]) =>
                from(this.collectionService.changeNoteTitle(note, newTitle)).pipe(
                    catchError((error) => {
                        this.handleNoteTitleChangeError(error, newTitle);
                        return of(null);
                    }),
                ),
            ),
        ).subscribe();
    }

    ngOnDestroy(): void {
        this.listTopFocusOutSubscription.unsubscribe();
        this.menuMessageSubscription.unsubscribe();
        this.selectedNoteTitleChangedSubscription.unsubscribe();
        this.titleChangeSubscription.unsubscribe();
    }

    moveFocusToSnippetEditor(event: KeyboardEvent): void {
        const { keyCode } = event;

        if (keyCode === DOWN_ARROW || keyCode === ENTER) {
            event.preventDefault();
            this.snippetListManager.focusTo(0);
        }
    }

    private createNewTextSnippet(ref: NoteSnippetEditorRef<any>): void {
        const snippet: NoteSnippetContent = {
            type: NoteSnippetTypes.TEXT,
            value: '',
        };
        const event = new NoteSnippetEditorNewSnippetEvent(ref, { snippet });

        this.snippetListManager.handleSnippetRefEvent(event);
    }

    private createNewCodeSnippet(ref: NoteSnippetEditorRef<any>): void {
        this.actionDialog.open({ actionType: 'create' }).afterClosed().subscribe((result) => {
            if (result) {
                const snippet: NoteSnippetContent = {
                    type: NoteSnippetTypes.CODE,
                    value: '',
                    codeLanguageId: result.codeLanguageId,
                    codeFileName: result.codeFileName,
                };
                const event = new NoteSnippetEditorNewSnippetEvent(ref, { snippet });

                this.snippetListManager.handleSnippetRefEvent(event);
            }
        });
    }

    private async insertImageAtSnippet(ref: NoteSnippetEditorRef<any>): Promise<void> {
        if (ref._config.type !== NoteSnippetTypes.TEXT) {
            return;
        }

        const result = await toPromise(this.nativeDialog.showOpenDialog({
            message: 'Choose an image:',
            properties: NativeDialogProperties.OPEN_FILE,
            fileFilters: [nativeDialogFileFilters.IMAGES],
        }));

        if (!result.isSelected) {
            return;
        }

        const currentSelectedNote = await toPromise(this.store.pipe(
            select(state => state.note.collection.selectedNote),
            take(1),
        ));

        if (!currentSelectedNote) {
            return;
        }

        const { contentFilePath } = currentSelectedNote;
        const asset = await toPromise(this.editorService.copyAssetFile(
            AssetTypes.IMAGE,
            contentFilePath,
            result.filePaths[0],
        ));

        if (asset) {
            const event = new NoteSnippetEditorInsertImageEvent(ref, {
                fileName: asset.fileNameWithoutExtension,
                filePath: asset.relativePathToWorkspaceDir,
            });

            this.snippetListManager.handleSnippetRefEvent(event);
        }
    }

    private handleNoteTitleChangeError(error: Error, titleToChange: string): void {
        let message: string;

        if (error instanceof NoteContentFileAlreadyExistsError) {
            message = `Note file with the same file already exists. Please use a different title.`;
        } else {
            message = error && error.message ? error.message : 'Unknown Error';
        }

        // FIXME LATER: I think this is not good handling. We need to think about UX.
        this.confirmDialog.open({
            isAlert: true,
            title: `Cannot update note title to: "${titleToChange}"`,
            body: message,
        });
    }
}
