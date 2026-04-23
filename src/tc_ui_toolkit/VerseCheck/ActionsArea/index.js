import React from 'react'
import PropTypes from 'prop-types'
import isEqual from 'deep-equal'
import Checkbox from '@mui/material/Checkbox'
import { withStyles } from '@mui/styles'
import FormControlLabel from '@mui/material/FormControlLabel'
import InfoIcon from '@mui/icons-material/Info'
import CheckBoxOutlineIcon from '@mui/icons-material/CheckBoxOutlineBlank'
import CheckBoxIcon from '@mui/icons-material/CheckBox'
import { Tooltip, IconButton, Typography } from '@mui/material'
// import { Tooltip as ReactTooltip } from 'react-tooltip'
// components
import Bookmark from '../../Bookmark'
// css
import './ActionsArea.styles.css'
import Hint from '../../Hint/Hint'
import { FaCheck } from 'react-icons/fa'
import { TfiComment, TfiPencil } from 'react-icons/tfi'
import { LuEraser } from 'react-icons/lu'

const styles = {
  formControl: { margin: '0' },
  label: {
    color: 'var(--accent-color-dark)',
    fontWeight: 'normal',
    fontSize: 14,
  },
  checkBoxRoot: {
    padding: '12px 5px',
    color: 'var(--accent-color-dark)',
    '&$checked': { color: 'var(--accent-color-dark)' },
  },
  checked: {},
  icon: {
    color: 'var(--accent-color-dark)',
    verticalAlign: 'middle',
    margin: '5px',
    width: 30,
    height: 30,
    cursor: 'pointer',
  },
  actionButtons: {
    width: '140px',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    paddingRight: '0px',
  },
}

const hideBookmarks = false
const hideEdit = false
const hideComment = false

const actionButtonStyleRM = {
  ...styles.actionButtons,
  marginRight: '5px',
}

const isSelectionsSaveDisable = (
  localNothingToSelect,
  nothingToSelect,
  newSelections,
  selections
) => {
  if (
    newSelections.length > 0 ||
    (newSelections.length === 0 && !isEqual(newSelections, selections))
  ) {
    return isEqual(newSelections, selections)
  }

  return localNothingToSelect === nothingToSelect
}

/* eslint-disable react/prop-types */
const ChangeModeArea = ({
  translate,
  bookmarkEnabled,
  toggleBookmark,
  changeMode,
}) => {
  // return (
  //   <div style={{ backgroundColor: '#FFCC00' }}>
  //     <h1>ChangeModeArea</h1>
  //     <div>translate {typeof translate}</div>
  //     <div>bookmarkEnabled {typeof bookmarkEnabled}</div>
  //     <div>toggleBookmark {typeof toggleBookmark}</div>
  //     <div>changeMode {typeof changeMode}</div>
  //   </div>
  // )
  const selectText = translate('select');
  const editVerseText = translate('edit_verse');
  const commentText = translate('comment');
  return (
    <div className='actions-area'>
      {!hideBookmarks &&
        <Bookmark
          value='bookmark'
          color='primary'
          checked={bookmarkEnabled}
          label={translate('bookmark')}
          onChange={toggleBookmark} />
      }
      <div style={{ display: 'flex', marginLeft: 'auto' }}>
        <Hint
          position={'top'}
          size='medium'
          label={selectText}
          enabled={!!selectText}
          hintLength={14}
        >
          <button
            style={actionButtonStyleRM}
            className='btn-second'
            onClick={() => changeMode('select')}
          >
            <FaCheck style={{ marginRight: '10px' }} />
            {selectText}
          </button>
        </Hint>
        {!hideEdit &&
          <Hint
            position={'top'}
            size='medium'
            label={editVerseText}
            enabled={!!editVerseText}
            hintLength={14}
          >
            <button
              style={actionButtonStyleRM}
              className='btn-second'
              onClick={() => changeMode('edit')}
            >
              <TfiPencil style={{ marginRight: '10px' }} />
              {editVerseText}
            </button>
          </Hint>
        }
        {!hideComment &&
          <Hint
            position={'top'}
            size='medium'
            label={commentText}
            enabled={!!commentText}
            hintLength={14}
          >
            <button
              style={styles.actionButtons}
              className='btn-second'
              onClick={() => changeMode('comment')}
            >
              <TfiComment style={{ marginRight: '10px' }} />
              {commentText}
            </button>
          </Hint>
        }
      </div>
    </div>
  );
}

const ConfirmEditVerseArea = ({
  translate,
  tags,
  cancelEditVerse,
  saveEditVerse,
}) => {
  // return (
  //   <div style={{ backgroundColor: '#FFCC00' }}>
  //     <h1>ConfirmEditVerseArea</h1>
  //     <div>translate {typeof translate}</div>
  //     <div>tags {typeof tags}</div>
  //     <div>cancelEditVerse {typeof cancelEditVerse}</div>
  //     <div>saveEditVerse {typeof saveEditVerse}</div>
  //   </div>
  // )
  const cancelText = translate('cancel')
  const saveText = translate('save')
  return (
    <div className='actions-area'>
      <Hint
        position={'top'}
        size='medium'
        label={cancelText}
        enabled={!!cancelText}
        hintLength={14}
      >
        <button className='btn-second' onClick={cancelEditVerse}>
          {cancelText}
        </button>
      </Hint>
      <Hint
        position={'top'}
        size='medium'
        label={saveText}
        enabled={!!saveText}
        hintLength={14}
      >
        <button
          className='btn-prime'
          disabled={!tags.length}
          onClick={saveEditVerse}
        >
          <FaCheck style={{ marginRight: '10px' }} />
          {saveText}
        </button>
      </Hint>
    </div>
  )
}

const ConfirmCommentArea = ({
  translate,
  isCommentChanged,
  cancelComment,
  saveComment,
}) => {
  // return (
  //   <div style={{ backgroundColor: '#FFCC00' }}>
  //     <h1>ConfirmCommentArea</h1>
  //     <div>translate {typeof translate}</div>
  //     <div>isCommentChanged {typeof isCommentChanged}</div>
  //     <div>cancelComment {typeof cancelComment}</div>
  //     <div>saveComment {typeof saveComment}</div>
  //   </div>
  // )
  const cancelText = translate('cancel')
  const saveText = translate('save')
  return (
    <div className='actions-area'>
      <Hint
        position={'top'}
        size='medium'
        label={cancelText}
        enabled={!!cancelText}
        hintLength={14}
      >
        <button className='btn-second' onClick={cancelComment}>
          {cancelText}
        </button>
      </Hint>
      <Hint
        position={'top'}
        size='medium'
        label={saveText}
        enabled={!!saveText}
        hintLength={14}
      >
        <button
          className='btn-prime'
          disabled={!isCommentChanged}
          onClick={saveComment}
        >
          <FaCheck style={{ marginRight: '10px' }} />
          {saveText}
        </button>
      </Hint>
    </div>
  )
}

const ConfirmSelectionArea = ({
  classes,
  translate,
  localNothingToSelect,
  newSelections,
  nothingToSelect,
  selections,
  toggleNothingToSelect,
  cancelSelection,
  clearSelection,
  saveSelection,
}) => {
  /*return <div style={{backgroundColor: "#FFCC00"}}>
    <h1>ConfirmSelectionArea</h1>
    <div>classes {typeof classes}</div>
    <div>localNothingToSelect {typeof localNothingToSelect}</div>
    <div>newSelections {typeof newSelections}</div>
    <div>nothingToSelect {typeof nothingToSelect}</div>
    <div>selections {typeof selections}</div>
    <div>toggleNothingToSelect {typeof toggleNothingToSelect}</div>
    <div>cancelSelection {typeof cancelSelection}</div>
    <div>clearSelection {typeof clearSelection}</div>
    <div>saveSelection {typeof saveSelection}</div>
  </div>
  <Checkbox
              checked={localNothingToSelect}
              disabled={newSelections && newSelections.length > 0}
              color="primary"
              onChange={event => toggleNothingToSelect(event.target.checked)}
              value="nothingToSelect"
              classes={{
                root: classes.checkBoxRoot,
                checked: classes.checked,
              }}
              icon={<CheckBoxOutlineIcon style={{ fontSize: '24px' }}/>}
              checkedIcon={<CheckBoxIcon style={{ fontSize: '24px' }}/>}
            />*/
  // translate('no_selection_needed') ||
  //translate('nothing_to_select_description')
  const cancelText = translate('cancel')
  const clearSelectionText = translate('clear_selection')
  const saveText = translate('save')
  return (
    <div className='selection-actions-area'>
      <div className='flex-row'>
        <FormControlLabel
          control={
            <Checkbox
              checked={localNothingToSelect}
              disabled={newSelections && newSelections.length > 0}
              color='primary'
              onChange={event => toggleNothingToSelect(event.target.checked)}
              value='nothingToSelect'
              classes={{
                root: classes.checkBoxRoot,
                checked: classes.checked,
              }}
              icon={<CheckBoxOutlineIcon style={{ fontSize: '24px' }} />}
              checkedIcon={<CheckBoxIcon style={{ fontSize: '24px' }} />}
            />
          }
          label={translate('no_selection_needed')}
        />
        <Tooltip
          title={
            <Typography sx={{ fontSize: '0.8em' }}>
              {translate('nothing_to_select_description')}
            </Typography>
          }
          placement='top'
          arrow
          slotProps={{
            tooltip: {
              sx: {
                backgroundColor: '#333',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.8em',
              },
            },
            arrow: {
              sx: { color: '#333' },
            },
          }}
          enterDelay={100}
          leaveDelay={100}
        >

            <InfoIcon sx={{ fontSize: 18, color: '#555' }} />
        </Tooltip>
      </div>
      <div style={{ whiteSpace: 'nowrap' }}>
        <Hint
          position={'top'}
          size='medium'
          label={cancelText}
          enabled={!!cancelText}
          hintLength={14}
        >
          <button
            className='btn-second'
            style={{
              ...actionButtonStyleRM,
              marginLeft: '0px',
              alignSelf: 'flex-start',
            }}
            onClick={cancelSelection}
          >
            {cancelText}
          </button>
        </Hint>
        <Hint
          position={'top'}
          size='medium'
          label={clearSelectionText}
          enabled={!!clearSelectionText}
          hintLength={14}
        >
          <button
            className='btn-second'
            style={actionButtonStyleRM}
            disabled={newSelections.length > 0 ? false : true}
            onClick={clearSelection}
          >
            <LuEraser style={{ marginRight: '10px' }} />
            {clearSelectionText}
          </button>
        </Hint>
        <Hint
          position={'top'}
          size='medium'
          label={saveText}
          enabled={!!saveText}
          hintLength={14}
        >
          <button
            className='btn-prime'
            style={actionButtonStyleRM}
            disabled={isSelectionsSaveDisable(
              localNothingToSelect,
              nothingToSelect,
              newSelections,
              selections
            )}
            onClick={saveSelection}
          >
            <FaCheck style={{ marginRight: '10px' }} />
            {saveText}
          </button>
        </Hint>
      </div>
    </div>
  )
}
/* eslint-enable react/prop-types */

const ActionsArea = ({
  tags,
  mode,
  isCommentChanged,
  selections,
  newSelections,
  bookmarkEnabled,
  saveSelection,
  cancelSelection,
  clearSelection,
  translate,
  classes,
  localNothingToSelect,
  nothingToSelect,
  toggleNothingToSelect,
  toggleBookmark,
  changeMode,
  cancelEditVerse,
  saveEditVerse,
  cancelComment,
  saveComment,
  disables,
}) => {
  const { bookMark: disableBookMark } = disables || {}
  console.log('mode', mode || 'NO MODE')
  switch (mode) {
    case 'edit':
      return (
        <ConfirmEditVerseArea
          tags={tags}
          translate={translate}
          cancelEditVerse={cancelEditVerse}
          saveEditVerse={saveEditVerse}
        />
      )
    case 'comment':
      return (
        <ConfirmCommentArea
          translate={translate}
          isCommentChanged={isCommentChanged}
          cancelComment={cancelComment}
          saveComment={saveComment}
        />
      )
    case 'select':
      return (
        <ConfirmSelectionArea
          classes={classes}
          translate={translate}
          localNothingToSelect={localNothingToSelect}
          newSelections={newSelections}
          nothingToSelect={nothingToSelect}
          selections={selections}
          toggleNothingToSelect={toggleNothingToSelect}
          cancelSelection={cancelSelection}
          clearSelection={clearSelection}
          saveSelection={saveSelection}
        />
      )

    case 'default':
      return (
        <ChangeModeArea
          translate={translate}
          bookmarkEnabled={bookmarkEnabled}
          toggleBookmark={toggleBookmark}
          changeMode={changeMode}
        />
      )
    default:
      return (
        <ChangeModeArea
          translate={translate}
          bookmarkEnabled={bookmarkEnabled}
          toggleBookmark={toggleBookmark}
          changeMode={changeMode}
        />
      )
  }
}

ActionsArea.propTypes = {
  tags: PropTypes.array.isRequired,
  mode: PropTypes.string.isRequired,
  isCommentChanged: PropTypes.bool.isRequired,
  selections: PropTypes.array.isRequired,
  newSelections: PropTypes.array.isRequired,
  bookmarkEnabled: PropTypes.bool.isRequired,
  classes: PropTypes.object.isRequired,
  localNothingToSelect: PropTypes.bool.isRequired,
  nothingToSelect: PropTypes.bool.isRequired,
  saveSelection: PropTypes.func.isRequired,
  cancelSelection: PropTypes.func.isRequired,
  clearSelection: PropTypes.func.isRequired,
  translate: PropTypes.func.isRequired,
  toggleNothingToSelect: PropTypes.func.isRequired,
  toggleBookmark: PropTypes.func.isRequired,
  changeMode: PropTypes.func.isRequired,
  cancelEditVerse: PropTypes.func.isRequired,
  saveEditVerse: PropTypes.func.isRequired,
  cancelComment: PropTypes.func.isRequired,
  saveComment: PropTypes.func.isRequired,
  disables: PropTypes.object,
}

ActionsArea.defaultProps = {
  disables: {},
}

export default withStyles(styles)(ActionsArea)
